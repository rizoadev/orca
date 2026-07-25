/* eslint-disable max-lines -- Why: RPC method definitions co-locate param schemas with handlers; splitting by method would scatter the shared enums and Zod transforms without reducing complexity. */
import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import {
  OptionalFiniteNumber,
  OptionalPlainString,
  OptionalString,
  OptionalBoolean,
  requiredString
} from '../schemas'
import type { MessageType, MessagePriority, TaskStatus } from '../../orchestration/db'
import { buildDispatchPreamble } from '../../orchestration/preamble'
import {
  buildSquadLeaderBriefing,
  findAgentSquad,
  normalizeAgentSquads,
  parseSquadAddress,
  resolveSquadLeader
} from '../../../../shared/agent-squads'
import { classifyDelegation, classifyDirectHuman } from '../../../../shared/agent-run-attribution'
import {
  formatCoalescedPrompt,
  tryCoalesceFollowUp
} from '../../../../shared/agent-followup-coalesce'
import { formatMessageBanner } from '../../orchestration/formatter'
import { isGroupAddress, resolveGroupAddress } from '../../orchestration/groups'
import { reconcileLifecycleMessage } from '../../orchestration/lifecycle-reconciliation'
import {
  assertOrchestrationStringListFits,
  assertOrchestrationWaitTypeFilterFits,
  assertOrchestrationWriteFits
} from '../../orchestration/query-retention'
import { abbreviateOrchestrationTasks } from '../../../../shared/orchestration-task-summary'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree-id'
import { createProductPipelineTasks } from '../../orchestration/product-pipeline-engine'
import {
  dispatchAllReadyPipelineStages,
  dispatchPipelineStageTask
} from '../../orchestration/product-pipeline-dispatch'
import {
  getProductSupervisorSnapshot,
  stopProductSupervisor,
  unwatchProductPipeline,
  watchProductPipeline
} from '../../orchestration/product-pipeline-supervisor'
import { defaultSquadSeed } from '../../../../shared/product-pipeline'
import { deliverOperatorComment } from '../../orchestration/task-comment-delivery-service'
import { ORCHESTRATION_GATE_METHODS } from './orchestration-gates'

/** Best-effort scope from the creating terminal when CLI/UI omit --repo/--worktree/--host. */
async function resolveTaskScopeFromCallerTerminal(
  runtime: {
    showTerminal: (handle: string) => Promise<{ worktreeId: string }>
    showManagedWorktree: (selector: string) => Promise<{ hostId?: string | null }>
  },
  callerTerminalHandle: string | undefined,
  explicit: { repoId?: string; worktreeId?: string; hostId?: string }
): Promise<{ repoId?: string; worktreeId?: string; hostId?: string }> {
  if (!callerTerminalHandle) {
    return explicit
  }
  if (explicit.repoId && explicit.worktreeId && explicit.hostId) {
    return explicit
  }
  try {
    const terminal = await runtime.showTerminal(callerTerminalHandle)
    const worktreeId = explicit.worktreeId ?? terminal.worktreeId
    const repoId =
      explicit.repoId ??
      (worktreeId ? getRepoIdFromWorktreeId(worktreeId) || undefined : undefined)
    let hostId = explicit.hostId
    if (!hostId && worktreeId) {
      try {
        const worktree = await runtime.showManagedWorktree(`id:${worktreeId}`)
        hostId = worktree.hostId ?? 'local'
      } catch {
        hostId = 'local'
      }
    }
    return { repoId, worktreeId, hostId }
  } catch {
    // Why: stale handle must not block task creation; scope stays unset for later task-scope rebind.
    return explicit
  }
}

const MESSAGE_TYPES: MessageType[] = [
  'status',
  'dispatch',
  'worker_done',
  'merge_ready',
  'escalation',
  'handoff',
  'decision_gate',
  'heartbeat'
]

function parseMessageTypeFilter(types: string | undefined): MessageType[] | undefined {
  if (!types) {
    return undefined
  }
  const parsed = types
    .split(',')
    .map((type) => type.trim())
    .filter(Boolean) as MessageType[]
  const invalidTypes = parsed.filter((type) => !MESSAGE_TYPES.includes(type))
  if (invalidTypes.length > 0) {
    throw new Error(`Invalid --types: ${invalidTypes.join(',')}`)
  }
  return Array.from(new Set(parsed))
}

const TASK_STATUSES: TaskStatus[] = [
  'pending',
  'ready',
  'dispatched',
  'completed',
  'failed',
  'blocked'
]

function getLifecycleGroupRecipientError(type: 'worker_done' | 'heartbeat'): string {
  return `${type} messages must be sent to a concrete coordinator terminal handle, not a group address.`
}

const SendParams = z
  .object({
    to: requiredString('Missing --to'),
    subject: requiredString('Missing --subject'),
    from: OptionalString,
    body: OptionalString,
    type: z
      .enum([
        'status',
        'dispatch',
        'worker_done',
        'merge_ready',
        'escalation',
        'handoff',
        'decision_gate',
        'heartbeat'
      ])
      .optional(),
    priority: z.enum(['normal', 'high', 'urgent']).optional(),
    threadId: OptionalString,
    payload: OptionalString,
    // Why: pane key is the remint-stable identity used to verify worker_done/heartbeat ownership; the from handle stays routing metadata.
    senderPaneKey: OptionalString,
    devMode: OptionalBoolean
  })
  .superRefine((params, ctx) => {
    if (
      (params.type !== 'worker_done' && params.type !== 'heartbeat') ||
      !isGroupAddress(params.to)
    ) {
      return
    }
    // Why: dispatch lifecycle messages are authority/liveness signals for one coordinator; fanout would create lifecycle mail in unrelated terminals.
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: getLifecycleGroupRecipientError(params.type),
      path: ['to']
    })
  })

const CheckParams = z
  .object({
    terminal: OptionalString,
    unread: OptionalBoolean,
    peek: OptionalBoolean,
    // Why: `all` surfaces every message and skips mark-read; legacy encoding was the `{unread: false}` trick (design doc §3.2/§3.3).
    all: OptionalBoolean,
    types: OptionalString,
    inject: OptionalBoolean,
    wait: OptionalBoolean,
    timeoutMs: OptionalFiniteNumber
  })
  .superRefine((params, ctx) => {
    // Why: CLI encodes --peek as {peek:true, unread:false} for pre-peek runtimes, so that pair is one mode, not a conflict.
    const modes = [
      params.unread === true,
      params.peek === true,
      params.all === true || (params.unread === false && params.peek !== true)
    ].filter(Boolean)
    if (modes.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose at most one message read mode: --unread, --peek, or --all.'
      })
    }
  })

const ReplyParams = z.object({
  id: requiredString('Missing --id'),
  body: requiredString('Missing --body'),
  from: OptionalString
})

const InboxParams = z.object({
  limit: OptionalFiniteNumber,
  // Why: filters the inbox to a handle so inbox and check --all give agreeing results (design doc §3.3).
  terminal: OptionalString
})

const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])

const TaskCreateParams = z.object({
  spec: requiredString('Missing --spec'),
  taskTitle: OptionalString,
  displayName: OptionalString,
  deps: OptionalString,
  parent: OptionalString,
  callerTerminalHandle: OptionalString,
  // Why: when set, fold into an existing pending/ready task with the same title key instead of spawning a sibling.
  coalesceKey: OptionalString,
  originatorId: OptionalString,
  priority: TaskPrioritySchema.optional(),
  // Soft scope pointers: stored in userData orchestration.db, not in the worktree folder.
  repoId: OptionalString,
  projectId: OptionalString,
  worktreeId: OptionalString,
  hostId: OptionalString
})

const TaskListParams = z.object({
  status: z.enum(['pending', 'ready', 'dispatched', 'completed', 'failed', 'blocked']).optional(),
  ready: OptionalBoolean,
  // Why: server-side truncation keeps --brief cheap over SSH/relay instead of shipping full specs the CLI throws away.
  brief: OptionalBoolean,
  repoId: OptionalString,
  projectId: OptionalString,
  worktreeId: OptionalString,
  hostId: OptionalString,
  priority: TaskPrioritySchema.optional()
})

const TaskUpdateParams = z.object({
  id: requiredString('Missing --id'),
  status: z
    .unknown()
    .transform((v) => {
      if (typeof v === 'string' && TASK_STATUSES.includes(v as TaskStatus)) {
        return v as TaskStatus
      }
      return ''
    })
    .pipe(
      z.enum(['pending', 'ready', 'dispatched', 'completed', 'failed', 'blocked'], {
        message: 'Missing --status'
      })
    ),
  result: OptionalString
})

const TaskStopParams = z.object({
  id: requiredString('Missing --id'),
  reason: OptionalString
})

const TaskDeleteParams = z.object({
  id: requiredString('Missing --id')
})

const TaskRetryParams = z.object({
  id: requiredString('Missing --id'),
  reason: OptionalString,
  // When true (default), re-assign via squad/role dispatch after reopen.
  assign: OptionalBoolean,
  squad: OptionalString,
  inject: OptionalBoolean,
  spawnIfMissing: OptionalBoolean,
  waitTimeoutMs: OptionalFiniteNumber
})

const TaskCommentListParams = z.object({
  task: requiredString('Missing --task')
})

const TaskCommentAddParams = z.object({
  task: requiredString('Missing --task'),
  body: requiredString('Missing --body'),
  author: OptionalString,
  role: OptionalString,
  kind: z.enum(['comment', 'result', 'system', 'dispatch']).optional(),
  parentId: OptionalString,
  // When set, resolve author from terminal handle (agent posting)
  from: OptionalString,
  // Why: operator comments should wake the in-charge agent (or @mentions) by default.
  notify: OptionalBoolean,
  // When true, reopen completed/failed tasks and create a fresh dispatch before inject.
  reassign: OptionalBoolean
})

const TaskThreadParams = z.object({
  task: requiredString('Missing --task')
})

// Why: separate from taskUpdate so lifecycle status changes stay distinct from scope rebinding (e.g. worktree deleted).
const TaskScopeParams = z.object({
  id: requiredString('Missing --id'),
  priority: TaskPrioritySchema.optional(),
  // Empty string clears a pointer; omit leaves it unchanged. OptionalPlainString preserves ''.
  repoId: OptionalPlainString,
  projectId: OptionalPlainString,
  worktreeId: OptionalPlainString,
  hostId: OptionalPlainString
})

const TaskAssignSquadParams = z.object({
  task: requiredString('Missing --task'),
  squad: requiredString('Missing --squad'),
  from: OptionalString,
  // Why: optional override when task has no worktree_id and the caller wants a specific checkout.
  worktree: OptionalString,
  inject: OptionalBoolean,
  // Why: spawn a fresh squad agent terminal when no matching live terminal exists.
  spawnIfMissing: OptionalBoolean,
  waitTimeoutMs: OptionalFiniteNumber,
  devMode: OptionalBoolean,
  originatorId: OptionalString
})

const ProductStartParams = z.object({
  goal: requiredString('Missing --goal'),
  title: OptionalString,
  // repo selector (id:/path:) — required to create an isolated product worktree
  repo: requiredString('Missing --repo'),
  // existing worktree selector; when set, skip create and use this checkout
  worktree: OptionalString,
  baseBranch: OptionalString,
  // create a GitHub issue for the goal and link it to the worktree
  createIssue: OptionalBoolean,
  // seed Settings agentSquads with researcher/backend/tester/reviewer if empty
  ensureSquads: OptionalBoolean,
  // immediately dispatch ready stages (research first)
  autoDispatch: OptionalBoolean,
  waitTimeoutMs: OptionalFiniteNumber,
  devMode: OptionalBoolean,
  priority: TaskPrioritySchema.optional()
})

const ProductTickParams = z.object({
  pipeline: requiredString('Missing --pipeline'),
  waitTimeoutMs: OptionalFiniteNumber,
  devMode: OptionalBoolean
})

const ProductWatchParams = z.object({
  pipeline: requiredString('Missing --pipeline'),
  pollIntervalMs: OptionalFiniteNumber,
  devMode: OptionalBoolean
})

const ProductUnwatchParams = z.object({
  pipeline: requiredString('Missing --pipeline')
})

const ProductSupervisorParams = z.object({})

const DispatchParams = z.object({
  task: requiredString('Missing --task'),
  // Why: --to is optional so --dry-run can preview without a target; the handler enforces presence before any side-effecting work.
  to: OptionalString,
  from: OptionalString,
  inject: OptionalBoolean,
  dryRun: OptionalBoolean,
  returnPreamble: OptionalBoolean,
  devMode: OptionalBoolean,
  // Why: optional @squad:<id> context so the worker preamble can include the leader briefing.
  squad: OptionalString,
  originatorId: OptionalString
})

const DispatchShowParams = z.object({
  task: OptionalString,
  preamble: OptionalBoolean,
  from: OptionalString,
  devMode: OptionalBoolean
})

const AskParams = z.object({
  to: requiredString('Missing --to'),
  question: requiredString('Missing --question'),
  options: OptionalString,
  timeoutMs: OptionalFiniteNumber,
  from: OptionalString
})

const ResetParams = z
  .object({
    all: OptionalBoolean,
    tasks: OptionalBoolean,
    messages: OptionalBoolean
  })
  .superRefine((params, ctx) => {
    const selectedScopeCount = [params.all, params.tasks, params.messages].filter(
      (scope) => scope === true
    ).length
    if (selectedScopeCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose exactly one reset scope: --all, --tasks, or --messages.'
      })
    }
  })

export const ORCHESTRATION_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'orchestration.send',
    params: SendParams,
    handler: async (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const from = params.from ?? 'unknown'
      // Why: older shells may lack ORCA_PANE_KEY, but the runtime still knows the pane behind their handle; persist that authority.
      const senderPaneKey = params.senderPaneKey ?? runtime.getTerminalPaneKey(from) ?? undefined

      if (!isGroupAddress(params.to)) {
        // Point-to-point — existing single-recipient behavior
        const msg = db.insertMessage({
          from,
          to: params.to,
          subject: params.subject,
          body: params.body,
          type: params.type as MessageType,
          priority: params.priority as MessagePriority,
          threadId: params.threadId,
          payload: params.payload,
          senderPaneKey
        })
        // Why: reconcile releases the dispatch lock before waking recipients, else a woken coordinator re-dispatches while the lock is still held.
        if (msg.type === 'worker_done' || msg.type === 'heartbeat') {
          const reconciled = reconcileLifecycleMessage(db, msg)
          // Why: a suppressed message is already read, so skip the notify that would wake a check --wait waiter to an empty result.
          if (reconciled.action === 'suppressed') {
            return { message: msg }
          }
          if (reconciled.action === 'rejected') {
            const rejection = db.getMessageById(msg.id) ?? msg
            runtime.deliverPendingMessagesForHandle(params.to)
            runtime.notifyMessageArrived(params.to, rejection.type)
            return { message: rejection, lifecycle: reconciled }
          }
          // Why: product pipeline stages unlock after worker_done; auto-dispatch next role agents without a separate product-tick.
          if (
            msg.type === 'worker_done' &&
            reconciled.action === 'completed' &&
            reconciled.pipelineId
          ) {
            void dispatchAllReadyPipelineStages(db, runtime, reconciled.pipelineId, {
              coordinatorHandle: params.to,
              waitTimeoutMs: 90_000,
              devMode: params.devMode
            }).catch((err) => {
              // Best-effort: board/product-tick can still recover.
              void err
            })
          }
        }
        runtime.deliverPendingMessagesForHandle(params.to)
        runtime.notifyMessageArrived(params.to, msg.type)
        return { message: msg }
      }

      // Why: fan out one message per recipient (independent read-tracking) but share a thread_id for correlation (Section 4.5).
      const { terminals } = await runtime.listTerminals()
      const handles = resolveGroupAddress(
        params.to,
        from,
        terminals,
        (handle: string) => runtime.getAgentStatusForHandle(handle),
        // Why: @squad:* resolves against the same persisted squads the settings UI edits.
        runtime.getClientSettings().agentSquads
      )

      if (handles.length === 0) {
        throw new Error(`No recipients resolved for group address: ${params.to}`)
      }

      const threadId = params.threadId ?? `thread_${Date.now()}`
      const messages = handles.map((handle) =>
        db.insertMessage({
          from,
          to: handle,
          subject: params.subject,
          body: params.body,
          type: params.type as MessageType,
          priority: params.priority as MessagePriority,
          threadId,
          payload: params.payload,
          senderPaneKey
        })
      )
      for (const message of messages) {
        runtime.deliverPendingMessagesForHandle(message.to_handle)
        runtime.notifyMessageArrived(message.to_handle, message.type)
      }

      return { messages, recipients: handles.length }
    }
  }),

  defineMethod({
    name: 'orchestration.check',
    params: CheckParams,
    handler: async (params, { runtime, signal }) => {
      const db = runtime.getOrchestrationDb()
      const handle = params.terminal ?? 'unknown'
      if (params.wait) {
        assertOrchestrationWaitTypeFilterFits(params.types)
      }
      assertOrchestrationWriteFits('Message type filter', [params.types])
      const typeFilter = parseMessageTypeFilter(params.types)

      // Why: unread:false is honored for one release as a compat shim so in-flight callers don't break (design doc §5).
      const showAll = params.all === true || (params.unread === false && params.peek !== true)
      const consumeUnread = !showAll && params.peek !== true

      const readAndReturn = () => {
        const totalBeforeRead = showAll
          ? db.countAllMessagesForHandle(handle, typeFilter)
          : db.countUnreadMessages(handle, typeFilter)
        const messages = showAll
          ? db.getAllMessagesForHandle(handle, undefined, typeFilter)
          : db.getUnreadMessages(handle, typeFilter)

        let visibleMessages = messages
        if (consumeUnread && messages.length > 0) {
          // Why: unread check is an authoritative read path for worker_done/heartbeat, so reconcile lifecycle messages here too.
          visibleMessages = messages.map((message) => {
            const reconciled = reconcileLifecycleMessage(db, message)
            return reconciled.action === 'rejected'
              ? (db.getMessageById(message.id) ?? message)
              : message
          })
          db.markAsRead(messages.map((m) => m.id))
        }

        const remaining = consumeUnread
          ? db.countUnreadMessages(handle, typeFilter)
          : Math.max(0, totalBeforeRead - messages.length)
        const saturation = remaining > 0 ? { truncated: true as const, remaining } : {}
        if (params.inject) {
          const formatted = visibleMessages.map(formatMessageBanner).join('\n\n')
          return {
            messages: visibleMessages,
            formatted,
            count: visibleMessages.length,
            ...saturation
          }
        }

        return { messages: visibleMessages, count: visibleMessages.length, ...saturation }
      }

      if (signal?.aborted) {
        return { messages: [], count: 0 }
      }
      const result = readAndReturn()
      if (result.count > 0 || result.truncated || !params.wait) {
        return result
      }

      // Why: signal aborts this waiter when the client socket closes, freeing the long-poll slot immediately rather than after timeoutMs (design doc §3.1).
      await runtime.waitForMessage(handle, {
        typeFilter: typeFilter as string[] | undefined,
        timeoutMs: params.timeoutMs ?? undefined,
        signal
      })
      if (signal?.aborted) {
        return { messages: [], count: 0 }
      }
      return readAndReturn()
    }
  }),

  defineMethod({
    name: 'orchestration.reply',
    params: ReplyParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const original = db.getMessageById(params.id)
      if (!original) {
        throw new Error(`Message not found: ${params.id}`)
      }

      db.markAsRead([original.id])

      const reply = db.insertMessage({
        from: params.from ?? original.to_handle,
        to: original.from_handle,
        subject: `Re: ${original.subject}`,
        body: params.body,
        threadId: original.thread_id ?? original.id
      })

      runtime.notifyMessageArrived(original.from_handle, reply.type)
      return { message: reply }
    }
  }),

  defineMethod({
    name: 'orchestration.inbox',
    params: InboxParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      // Why: stale/unknown handles return empty rather than error — historical rows survive handle deletion (design doc §3.3).
      const messages = params.terminal
        ? db.getAllMessagesForHandle(params.terminal, params.limit)
        : db.getInbox(params.limit)
      const total = params.terminal
        ? db.countAllMessagesForHandle(params.terminal)
        : db.countInbox()
      return {
        messages,
        count: messages.length,
        ...(total > messages.length ? { total, truncated: true as const } : {})
      }
    }
  }),

  defineMethod({
    name: 'orchestration.taskCreate',
    params: TaskCreateParams,
    handler: async (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      let deps: string[] | undefined
      if (params.deps) {
        try {
          assertOrchestrationWriteFits('Task dependencies', [params.deps])
          const parsed = JSON.parse(params.deps)
          if (!Array.isArray(parsed) || !parsed.every((d) => typeof d === 'string')) {
            throw new Error('not an array of strings')
          }
          assertOrchestrationStringListFits('Task dependencies', parsed)
          deps = parsed
        } catch {
          throw new Error('Invalid --deps: must be a JSON array of task IDs')
        }
      }

      // Why: Multica-style coalesce — fold follow-up specs into a pending/ready task with the same key.
      if (params.coalesceKey) {
        const existing = db.findCoalesceTarget(params.coalesceKey)
        if (existing) {
          const nextAttribution = params.originatorId
            ? classifyDirectHuman({
                originatorId: params.originatorId,
                evidenceKind: 'followup',
                evidenceRefId: existing.id
              })
            : undefined
          const merged = tryCoalesceFollowUp({
            targetKey: params.coalesceKey,
            state: existing.status === 'ready' ? 'ready' : 'pending',
            existingMessages: [existing.spec],
            nextMessage: params.spec,
            nextAttribution
          })
          if (merged.outcome === 'merged') {
            const task = db.appendTaskSpec(existing.id, formatCoalescedPrompt(merged.messages))
            return { task, coalesced: true as const }
          }
        }
      }

      const scope = await resolveTaskScopeFromCallerTerminal(runtime, params.callerTerminalHandle, {
        repoId: params.repoId,
        worktreeId: params.worktreeId,
        hostId: params.hostId
      })

      const task = db.createTask({
        spec: params.spec,
        taskTitle: params.taskTitle,
        // Why: default display_name to coalesceKey so later creates can find this row.
        displayName: params.displayName ?? params.coalesceKey,
        deps,
        parentId: params.parent,
        createdByTerminalHandle: params.callerTerminalHandle,
        priority: params.priority,
        repoId: scope.repoId,
        projectId: params.projectId,
        worktreeId: scope.worktreeId,
        hostId: scope.hostId
      })
      return { task }
    }
  }),

  defineMethod({
    name: 'orchestration.taskList',
    params: TaskListParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const filter = {
        status: params.status as TaskStatus,
        ready: params.ready,
        repoId: params.repoId,
        projectId: params.projectId,
        worktreeId: params.worktreeId,
        hostId: params.hostId,
        priority: params.priority
      }
      // Why: listTasksWithDispatch adds assignee_handle + dispatch_id (NULL for non-dispatched), so legacy-shape consumers are unaffected.
      const joined = db.listTasksWithDispatch(filter)
      const tasks = joined.map((row) => {
        const { assignee_handle, dispatch_id, ...base } = row
        if (base.status === 'dispatched') {
          return { ...base, assignee_handle, dispatch_id }
        }
        return base
      })
      const total = db.countTasks(filter)
      return {
        tasks: params.brief ? abbreviateOrchestrationTasks(tasks) : tasks,
        count: tasks.length,
        ...(total > tasks.length ? { total, truncated: true as const } : {})
      }
    }
  }),

  defineMethod({
    name: 'orchestration.taskUpdate',
    params: TaskUpdateParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const task = db.updateTaskStatus(params.id, params.status, params.result)
      if (!task) {
        throw new Error(`Task not found: ${params.id}`)
      }
      return { task }
    }
  }),

  defineMethod({
    name: 'orchestration.taskStop',
    params: TaskStopParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const stopped = db.stopTask(params.id, params.reason?.trim() || 'Stopped by operator')
      if (!stopped) {
        throw new Error(`Task not found: ${params.id}`)
      }
      // Why: product supervisor must drop a stopped pipeline root so it does not re-dispatch.
      if (stopped.task.pipeline_id === stopped.task.id) {
        unwatchProductPipeline(stopped.task.id)
      }
      return {
        task: stopped.task,
        stoppedIds: stopped.stoppedIds,
        supervisor: getProductSupervisorSnapshot()
      }
    }
  }),

  defineMethod({
    name: 'orchestration.taskDelete',
    params: TaskDeleteParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const existing = db.getTask(params.id)
      if (!existing) {
        throw new Error(`Task not found: ${params.id}`)
      }
      const pipelineRootId =
        existing.pipeline_id === existing.id ? existing.id : existing.pipeline_id
      const deleted = db.deleteTask(params.id)
      if (!deleted) {
        throw new Error(`Task not found: ${params.id}`)
      }
      if (pipelineRootId && deleted.deletedIds.includes(pipelineRootId)) {
        unwatchProductPipeline(pipelineRootId)
      }
      return {
        deletedIds: deleted.deletedIds,
        supervisor: getProductSupervisorSnapshot()
      }
    }
  }),

  defineMethod({
    name: 'orchestration.taskRetry',
    params: TaskRetryParams,
    handler: async (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const existing = db.getTask(params.id)
      if (!existing) {
        throw new Error(`Task not found: ${params.id}`)
      }
      const reason = params.reason?.trim() || 'Retried by operator after stop/error'
      const retried = db.retryTask(params.id, reason)
      if (!retried) {
        throw new Error(`Task not found: ${params.id}`)
      }

      // Product pipeline root: re-watch supervisor so ready stages dispatch again.
      if (retried.task.pipeline_id === retried.task.id) {
        watchProductPipeline(retried.task.id, db, runtime)
        try {
          await dispatchAllReadyPipelineStages(db, runtime, retried.task.id, {
            waitTimeoutMs: params.waitTimeoutMs ?? 60_000
          })
        } catch (err) {
          // Reopen still succeeded; surface dispatch errors without undoing retry.
          return {
            task: db.getTask(params.id) ?? retried.task,
            retriedIds: retried.retriedIds,
            assigned: false,
            warning: err instanceof Error ? err.message : String(err),
            supervisor: getProductSupervisorSnapshot()
          }
        }
        return {
          task: db.getTask(params.id) ?? retried.task,
          retriedIds: retried.retriedIds,
          assigned: true,
          supervisor: getProductSupervisorSnapshot()
        }
      }

      const shouldAssign = params.assign !== false
      if (!shouldAssign) {
        return {
          task: retried.task,
          retriedIds: retried.retriedIds,
          assigned: false,
          supervisor: getProductSupervisorSnapshot()
        }
      }

      // Stage/single task: prefer role pipeline dispatch, else squad assign.
      if (retried.task.pipeline_role && retried.task.worktree_id) {
        try {
          const dispatched = await dispatchPipelineStageTask(db, runtime, retried.task, {
            waitTimeoutMs: params.waitTimeoutMs ?? 60_000
          })
          return {
            task: dispatched.task,
            retriedIds: retried.retriedIds,
            assigned: true,
            to: dispatched.to,
            dispatchId: dispatched.dispatchId,
            spawned: dispatched.spawned,
            supervisor: getProductSupervisorSnapshot()
          }
        } catch (err) {
          return {
            task: db.getTask(params.id) ?? retried.task,
            retriedIds: retried.retriedIds,
            assigned: false,
            warning: err instanceof Error ? err.message : String(err),
            supervisor: getProductSupervisorSnapshot()
          }
        }
      }

      const squads = normalizeAgentSquads(runtime.getClientSettings().agentSquads)
      const squadId =
        params.squad?.trim() ||
        squads[0]?.id ||
        null
      if (!squadId) {
        return {
          task: retried.task,
          retriedIds: retried.retriedIds,
          assigned: false,
          warning: 'Task reopened as ready, but no squad is configured to re-assign',
          supervisor: getProductSupervisorSnapshot()
        }
      }

      // Spawn squad leader + inject dispatch preamble (same path product stages use).
      try {
        const leader = resolveSquadLeader(squads, squadId)
        if (!leader.ok) {
          throw new Error(leader.reason)
        }
        const worktreeId = retried.task.worktree_id
        if (!worktreeId) {
          return {
            task: retried.task,
            retriedIds: retried.retriedIds,
            assigned: false,
            warning: 'Task reopened as ready, but has no worktree_id for re-assign',
            supervisor: getProductSupervisorSnapshot()
          }
        }
        const agent = leader.leader.agent
        const created = await runtime.launchAgentTerminal(`id:${worktreeId}`, {
          agent,
          prompt: '',
          title: `retry:${retried.task.display_name || retried.task.id}`.slice(0, 60)
        })
        const handle = created.handle
        const waitMs = params.waitTimeoutMs ?? 60_000
        const deadline = Date.now() + waitMs
        try {
          await runtime.waitForTerminal(handle, {
            condition: 'tui-idle',
            timeoutMs: Math.min(waitMs, 45_000)
          })
        } catch {
          // keep probing
        }
        while (Date.now() < deadline) {
          if (await runtime.isTerminalRunningAgent(handle).catch(() => false)) {
            break
          }
          await new Promise((r) => setTimeout(r, 400))
        }
        if (!(await runtime.isTerminalRunningAgent(handle).catch(() => false))) {
          return {
            task: db.getTask(params.id) ?? retried.task,
            retriedIds: retried.retriedIds,
            assigned: false,
            warning: `Spawned ${handle} but agent never became ready`,
            supervisor: getProductSupervisorSnapshot()
          }
        }
        const readyTask = db.getTask(params.id) ?? retried.task
        if (readyTask.status !== 'ready') {
          db.reopenTask(readyTask.id)
        }
        const ctx = db.createDispatchContext(
          readyTask.id,
          handle,
          runtime.getTerminalPaneKey(handle) ?? undefined
        )
        const preamble = buildDispatchPreamble({
          taskId: readyTask.id,
          dispatchId: ctx.id,
          taskSpec: readyTask.spec,
          coordinatorHandle: 'operator',
          workerHandle: handle,
          cliCommand: runtime.getTerminalOrchestrationCliCommand(handle)
        })
        if (params.inject !== false) {
          await runtime.sendTerminalAgentPrompt(handle, preamble)
        }
        return {
          task: db.getTask(params.id) ?? readyTask,
          retriedIds: retried.retriedIds,
          assigned: true,
          to: handle,
          dispatchId: ctx.id,
          spawned: true,
          supervisor: getProductSupervisorSnapshot()
        }
      } catch (err) {
        return {
          task: db.getTask(params.id) ?? retried.task,
          retriedIds: retried.retriedIds,
          assigned: false,
          warning: err instanceof Error ? err.message : String(err),
          supervisor: getProductSupervisorSnapshot()
        }
      }
    }
  }),

  defineMethod({
    name: 'orchestration.taskCommentList',
    params: TaskCommentListParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      if (!db.getTask(params.task)) {
        throw new Error(`Task not found: ${params.task}`)
      }
      const comments = db.listTaskComments(params.task)
      return { comments, count: comments.length }
    }
  }),

  defineMethod({
    name: 'orchestration.taskCommentAdd',
    params: TaskCommentAddParams,
    handler: async (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const task = db.getTask(params.task)
      if (!task) {
        throw new Error(`Task not found: ${params.task}`)
      }
      const author = params.author?.trim() || params.from?.trim() || 'operator'
      const kind = params.kind ?? 'comment'
      const comment = db.addTaskComment({
        taskId: params.task,
        author,
        body: params.body,
        role: params.role,
        kind,
        parentId: params.parentId
      })

      const delivery = await deliverOperatorComment(db, runtime, {
        taskId: params.task,
        comment,
        author,
        body: params.body,
        notify: params.notify,
        reassign: params.reassign,
        // Why: UI comments with @mentions must wake agents immediately (no debounce).
        immediate: true
      })

      return {
        comment,
        notified: delivery.notified,
        reassigned: delivery.reassigned,
        reopened: delivery.reopened,
        coalesced: delivery.coalesced,
        mentions: delivery.mentions,
        ...(delivery.warning ? { warning: delivery.warning } : {})
      }
    }
  }),

  defineMethod({
    name: 'orchestration.taskThread',
    params: TaskThreadParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const task = db.getTask(params.task)
      if (!task) {
        throw new Error(`Task not found: ${params.task}`)
      }
      const comments = db.listTaskComments(params.task)
      const agents = db.listTaskAgents(params.task)
      const pipelineId = task.pipeline_id
      const roster =
        pipelineId && pipelineId === task.id
          ? db.listPipelineRoster(pipelineId)
          : pipelineId
            ? db.listPipelineRoster(pipelineId)
            : []
      const active = agents.find((a) => a.status === 'dispatched') ?? agents[0] ?? null
      return {
        task,
        comments,
        agents,
        roster,
        inCharge: active
          ? {
              handle: active.handle,
              role: active.role ?? task.pipeline_role,
              status: active.status,
              dispatchId: active.dispatchId
            }
          : {
              handle: null,
              role: task.pipeline_role,
              status: task.status,
              dispatchId: null
            }
      }
    }
  }),

  defineMethod({
    name: 'orchestration.taskScope',
    params: TaskScopeParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const hasScopeField =
        params.priority !== undefined ||
        params.repoId !== undefined ||
        params.projectId !== undefined ||
        params.worktreeId !== undefined ||
        params.hostId !== undefined
      if (!hasScopeField) {
        throw new Error(
          'taskScope requires at least one of: priority, repoId, projectId, worktreeId, hostId'
        )
      }
      const task = db.updateTaskScope(params.id, {
        priority: params.priority,
        repoId: params.repoId,
        projectId: params.projectId,
        worktreeId: params.worktreeId,
        hostId: params.hostId
      })
      if (!task) {
        throw new Error(`Task not found: ${params.id}`)
      }
      return { task }
    }
  }),

  defineMethod({
    name: 'orchestration.dispatch',
    params: DispatchParams,
    handler: async (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const task = db.getTask(params.task)
      if (!task) {
        throw new Error(`Task not found: ${params.task}`)
      }

      const resolveSquadBriefing = (): string | undefined => {
        const squadKey =
          params.squad?.trim() || (params.to ? parseSquadAddress(params.to) : null) || null
        if (!squadKey) {
          return undefined
        }
        const squads = normalizeAgentSquads(runtime.getClientSettings().agentSquads)
        const leader = resolveSquadLeader(squads, squadKey)
        if (!leader.ok) {
          return undefined
        }
        return buildSquadLeaderBriefing(leader.squad)
      }
      const squadBriefing = resolveSquadBriefing()

      // Why: dry-run previews the preamble without mutating state, so it skips the ready-status check and uses a placeholder dispatchId.
      if (params.dryRun) {
        const preamble = buildDispatchPreamble({
          taskId: task.id,
          dispatchId: 'ctx_dryrun',
          taskSpec: task.spec,
          coordinatorHandle: params.from ?? 'coordinator',
          workerHandle: params.to ?? 'worker',
          devMode: params.devMode,
          ...(squadBriefing ? { squadBriefing } : {}),
          ...(params.to
            ? { cliCommand: runtime.getTerminalOrchestrationCliCommand(params.to) }
            : {})
        })
        return { dispatch: null, injected: false, dryRun: true, preamble }
      }

      if (!params.to) {
        throw new Error('Missing --to')
      }
      const to = params.to

      if (task.status !== 'ready') {
        throw new Error(`Task ${params.task} is ${task.status}; only ready tasks can be dispatched`)
      }

      // Why: injecting the preamble into a bare shell dumps it as shell commands (gibberish), so require a detected agent first.
      if (params.inject) {
        const hasAgent = await runtime.isTerminalRunningAgent(to)
        if (!hasAgent) {
          throw new Error(
            `Cannot dispatch --inject to terminal ${to}: no recognized agent detected. ` +
              'Start an agent CLI (e.g. claude, codex, gemini, droid, cursor) in the terminal first, ' +
              'or dispatch without --inject and send the prompt manually.'
          )
        }
      }

      const ctx = db.createDispatchContext(
        params.task,
        to,
        runtime.getTerminalPaneKey(to) ?? undefined
      )

      // Why: built after ctx so dispatchId is the real ctx.id, letting heartbeats attribute liveness to a specific dispatch context, not just a task.
      // Why: originator stamps local delegation provenance for UI/audit; not on public telemetry wire.
      void (params.originatorId
        ? classifyDelegation({
            parent: classifyDirectHuman({
              originatorId: params.originatorId,
              evidenceKind: 'dispatch',
              evidenceRefId: ctx.id
            }),
            evidenceKind: 'dispatch',
            evidenceRefId: ctx.id,
            delegatedFromTaskId: task.id,
            isLeaderTask: Boolean(squadBriefing)
          })
        : null)
      const preamble = buildDispatchPreamble({
        taskId: task.id,
        dispatchId: ctx.id,
        taskSpec: task.spec,
        coordinatorHandle: params.from ?? 'coordinator',
        workerHandle: to,
        devMode: params.devMode,
        cliCommand: runtime.getTerminalOrchestrationCliCommand(to),
        ...(squadBriefing ? { squadBriefing } : {})
      })

      let injected = false
      if (params.inject) {
        try {
          await runtime.sendTerminalAgentPrompt(to, preamble)
          injected = true
        } catch (err) {
          db.failDispatch(ctx.id, err instanceof Error ? err.message : String(err))
          throw err
        }
      }

      // Why: returnPreamble is opt-in because the preamble is several hundred bytes most callers don't need in the response.
      if (params.returnPreamble) {
        return { dispatch: ctx, injected, preamble }
      }
      return { dispatch: ctx, injected }
    }
  }),

  defineMethod({
    name: 'orchestration.taskAssignSquad',
    params: TaskAssignSquadParams,
    handler: async (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const task = db.getTask(params.task)
      if (!task) {
        throw new Error(`Task not found: ${params.task}`)
      }
      if (task.status !== 'ready') {
        throw new Error(
          `Task ${params.task} is ${task.status}; only ready tasks can be assigned to a squad`
        )
      }

      const squads = normalizeAgentSquads(runtime.getClientSettings().agentSquads)
      const leader = resolveSquadLeader(squads, params.squad)
      if (!leader.ok) {
        throw new Error(leader.reason)
      }
      const squad = leader.squad
      const squadBriefing = buildSquadLeaderBriefing(squad)
      const inject = params.inject !== false
      const spawnIfMissing = params.spawnIfMissing !== false
      const waitTimeoutMs = params.waitTimeoutMs ?? 90_000

      const worktreeSelector =
        params.worktree?.trim() ||
        (task.worktree_id ? `id:${task.worktree_id}` : undefined)
      if (!worktreeSelector) {
        throw new Error(
          'Task has no worktree scope. Set --worktree on assign, or create the task with a worktree bound.'
        )
      }

      const from = params.from ?? 'coordinator'
      // Why: prefer spawning the routing target role — leader for leader_decide, else first member for idle_first.
      const spawnAgent =
        squad.routing === 'idle_first' && squad.members[0]
          ? squad.members[0].agent
          : squad.leader.agent

      const resolveLiveSquadHandle = async (): Promise<string | undefined> => {
        const { terminals } = await runtime.listTerminals(worktreeSelector)
        const resolved = resolveGroupAddress(
          `@squad:${squad.id}`,
          from,
          terminals,
          (handle: string) => runtime.getAgentStatusForHandle(handle),
          squads
        )
        // Why: title-match can hit bare shells named after the squad; only keep handles that actually run an agent.
        for (const handle of resolved) {
          try {
            if (await runtime.isTerminalRunningAgent(handle)) {
              return handle
            }
          } catch {
            // Stale handle — try the next candidate.
          }
        }
        return undefined
      }

      const spawnSquadTerminal = async (): Promise<string> => {
        // Why: createTerminal({ launchAgent }) does not build the agent startup command
        // (resolveAgentTerminalCreateOptions early-returns when launchAgent is already set).
        // launchAgentTerminal builds the real Pi/Claude/Codex command + env.
        const created = await runtime.launchAgentTerminal(worktreeSelector, {
          agent: spawnAgent,
          prompt: '',
          title: `${squad.name}: ${task.task_title || task.display_name || task.spec}`.slice(0, 60)
        })
        return created.handle
      }

      const waitReady = async (handle: string, timeoutMs: number): Promise<void> => {
        const deadline = Date.now() + timeoutMs
        // Why: tui-idle alone is not enough for fresh launchAgent boots (Pi/Claude can still be starting).
        try {
          await runtime.waitForTerminal(handle, {
            condition: 'tui-idle',
            timeoutMs: Math.max(1_000, Math.min(timeoutMs, 20_000))
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (message.includes('terminal_handle_stale') || message.includes('terminal_gone')) {
            throw err
          }
        }
        while (Date.now() < deadline) {
          try {
            if (await runtime.isTerminalRunningAgent(handle)) {
              return
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (message.includes('terminal_handle_stale') || message.includes('terminal_gone')) {
              throw err
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }

      let targetHandle = await resolveLiveSquadHandle()
      let spawned = false

      if (!targetHandle) {
        if (!spawnIfMissing) {
          throw new Error(
            `No live agent terminal found for squad "${squad.name}" in ${worktreeSelector}. ` +
              `Start a ${spawnAgent} agent there, or pass spawnIfMissing (default true).`
          )
        }
        try {
          targetHandle = await spawnSquadTerminal()
          spawned = true
          await waitReady(targetHandle, waitTimeoutMs)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          // Why: one remint/retry after spawn races (handle reissued before tui-idle).
          if (
            message.includes('terminal_handle_stale') ||
            message.includes('terminal_gone') ||
            message.includes('runtime_unavailable')
          ) {
            const recovered = await resolveLiveSquadHandle()
            if (recovered) {
              targetHandle = recovered
              spawned = true
            } else {
              targetHandle = await spawnSquadTerminal()
              spawned = true
              await waitReady(targetHandle, Math.min(waitTimeoutMs, 30_000))
            }
          } else {
            throw err
          }
        }
      } else if (inject) {
        try {
          await waitReady(targetHandle, Math.min(waitTimeoutMs, 30_000))
        } catch {
          // Existing live agent — inject probe below is authoritative.
        }
      }

      if (!targetHandle) {
        throw new Error(`Failed to resolve a terminal for squad "${squad.name}".`)
      }

      if (inject) {
        let hasAgent = false
        try {
          hasAgent = await runtime.isTerminalRunningAgent(targetHandle)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (message.includes('terminal_handle_stale') || message.includes('terminal_gone')) {
            const recovered = await resolveLiveSquadHandle()
            if (recovered) {
              targetHandle = recovered
              hasAgent = await runtime.isTerminalRunningAgent(targetHandle)
            }
          } else {
            throw err
          }
        }
        if (!hasAgent) {
          throw new Error(
            `Cannot inject into terminal ${targetHandle}: no recognized ${spawnAgent} agent detected. ` +
              'Open a Pi/Claude/Codex agent in that worktree, or retry assign so Orca can spawn one.'
          )
        }
      }

      const ctx = db.createDispatchContext(
        params.task,
        targetHandle,
        runtime.getTerminalPaneKey(targetHandle) ?? undefined
      )

      void (params.originatorId
        ? classifyDelegation({
            parent: classifyDirectHuman({
              originatorId: params.originatorId,
              evidenceKind: 'dispatch',
              evidenceRefId: ctx.id
            }),
            evidenceKind: 'dispatch',
            evidenceRefId: ctx.id,
            delegatedFromTaskId: task.id,
            isLeaderTask: true
          })
        : null)

      const preamble = buildDispatchPreamble({
        taskId: task.id,
        dispatchId: ctx.id,
        taskSpec: task.spec,
        coordinatorHandle: from,
        workerHandle: targetHandle,
        devMode: params.devMode,
        cliCommand: runtime.getTerminalOrchestrationCliCommand(targetHandle),
        squadBriefing
      })

      let injected = false
      if (inject) {
        try {
          await runtime.sendTerminalAgentPrompt(targetHandle, preamble)
          injected = true
        } catch (err) {
          db.failDispatch(ctx.id, err instanceof Error ? err.message : String(err))
          const message = err instanceof Error ? err.message : String(err)
          throw new Error(
            `Assigned dispatch ${ctx.id} but failed to inject prompt into ${targetHandle}: ${message}`
          )
        }
      }

      return {
        task: db.getTask(params.task),
        dispatch: ctx,
        injected,
        spawned,
        to: targetHandle,
        squad: { id: squad.id, name: squad.name, routing: squad.routing }
      }
    }
  }),

  defineMethod({
    name: 'orchestration.dispatchShow',
    params: DispatchShowParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      if (!params.task) {
        throw new Error('Missing --task')
      }
      const ctx = db.getDispatchContext(params.task)

      // Why: the preamble is derived from the current task spec, so it can be regenerated deterministically even after dispatch completes.
      if (params.preamble) {
        const task = db.getTask(params.task)
        if (!task) {
          throw new Error(`Task not found: ${params.task}`)
        }
        const workerHandle = ctx?.assignee_handle ?? 'worker'
        const preamble = buildDispatchPreamble({
          taskId: task.id,
          // Why: use the real ctx.id when present so the preview matches what was injected; placeholder when no dispatch has occurred yet.
          dispatchId: ctx?.id ?? 'ctx_preview',
          taskSpec: task.spec,
          coordinatorHandle: params.from ?? 'coordinator',
          workerHandle,
          devMode: params.devMode,
          ...(ctx ? { cliCommand: runtime.getTerminalOrchestrationCliCommand(workerHandle) } : {})
        })
        return { dispatch: ctx ?? null, preamble }
      }

      return { dispatch: ctx ?? null }
    }
  }),

  defineMethod({
    name: 'orchestration.ask',
    params: AskParams,
    handler: async (params, { runtime, signal }) => {
      // Why: group addresses have no unambiguous answer semantics; rejecting avoids a silent timeout on a decision_gate no one subscribes to.
      if (isGroupAddress(params.to)) {
        throw new Error(
          'ask does not support group addresses; use send --type decision_gate for fan-out questions'
        )
      }

      const db = runtime.getOrchestrationDb()
      const from = params.from ?? 'unknown'
      const timeoutMs = params.timeoutMs ?? 600_000
      assertOrchestrationWriteFits('Decision gate options', [params.options])
      const options =
        params.options
          ?.split(',')
          .map((s) => s.trim())
          .filter(Boolean) ?? []
      assertOrchestrationStringListFits('Decision gate options', options)

      const payload = JSON.stringify({ question: params.question, options })
      const outbound = db.insertMessage({
        from,
        to: params.to,
        subject: 'Question',
        body: params.question,
        type: 'decision_gate',
        payload
      })
      runtime.deliverPendingMessagesForHandle(params.to)
      runtime.notifyMessageArrived(params.to, outbound.type)

      const threadId = outbound.id
      const deadline = Date.now() + timeoutMs
      const afterSequence = outbound.sequence

      // Why: waitForMessage is handle-scoped, so re-query by thread each wake and bound by remaining budget so distractor messages can't loop forever.
      while (true) {
        const replies = db.getThreadMessagesFor(threadId, from, afterSequence)
        if (replies.length > 0) {
          const reply = replies[0]
          db.markAsRead([reply.id])
          return {
            answer: reply.body,
            messageId: reply.id,
            threadId,
            timedOut: false
          }
        }
        if (signal?.aborted) {
          return { answer: null, messageId: null, threadId, timedOut: true }
        }
        const remainingMs = deadline - Date.now()
        if (remainingMs <= 0) {
          return { answer: null, messageId: null, threadId, timedOut: true }
        }
        // Why: signal releases the waiter on client disconnect while the already-sent decision gate stays visible to the recipient.
        await runtime.waitForMessage(from, { timeoutMs: remainingMs, signal })
      }
    }
  }),

  ...ORCHESTRATION_GATE_METHODS,

  defineMethod({
    name: 'orchestration.productStart',
    params: ProductStartParams,
    handler: async (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const settings = runtime.getClientSettings() as {
        agentSquads?: unknown
        defaultTuiAgent?: string | null
      }

      // Seed role squads (researcher/backend/tester/reviewer) when missing.
      if (params.ensureSquads !== false) {
        const existing = normalizeAgentSquads(settings.agentSquads)
        const seed = defaultSquadSeed(settings.defaultTuiAgent)
        const byId = new Map(existing.map((s) => [s.id, s]))
        let changed = false
        for (const squad of seed) {
          if (!byId.has(squad.id)) {
            byId.set(squad.id, squad as never)
            changed = true
          }
        }
        if (changed && typeof runtime.updateClientSettings === 'function') {
          runtime.updateClientSettings({ agentSquads: [...byId.values()] })
        }
      }

      const repo = await runtime.showRepo(params.repo)
      let worktreeId = params.worktree?.trim() || null
      let worktreeCreated = false
      let issueNumber: number | null = null

      if (params.createIssue) {
        try {
          const issue = await runtime.createRepoIssue(
            params.repo,
            params.title?.trim() || params.goal.trim().slice(0, 120),
            [
              params.goal.trim(),
              '',
              '---',
              'Opened by Orca product pipeline (research → implement → test → review).'
            ].join('\n')
          )
          issueNumber =
            typeof (issue as { number?: unknown })?.number === 'number'
              ? ((issue as { number: number }).number as number)
              : null
        } catch (err) {
          // Non-fatal: pipeline still runs without a GitHub issue.
          void err
        }
      }

      if (!worktreeId) {
        const branchSlug = (params.title || params.goal)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40)
        const created = await runtime.createManagedWorktree({
          repoSelector: params.repo,
          name: branchSlug || `product-${Date.now().toString(36)}`,
          baseBranch: params.baseBranch,
          displayName: params.title?.trim() || params.goal.trim().slice(0, 80),
          comment: `Product pipeline: ${params.goal.trim().slice(0, 200)}`,
          linkedIssue: issueNumber,
          activate: true
        })
        worktreeId = created.worktree?.id ?? null
        worktreeCreated = true
        if (!worktreeId) {
          throw new Error('worktree.create returned without an id')
        }
      } else if (!worktreeId.includes('::')) {
        // Allow path/name selectors: resolve via show
        const shown = await runtime.showManagedWorktree(worktreeId)
        worktreeId = shown.id
      }

      const pipeline = createProductPipelineTasks(db, {
        productGoal: params.goal,
        title: params.title,
        repoId: repo.id,
        worktreeId,
        hostId: 'local',
        priority: params.priority ?? 'high'
      })

      let dispatches: Array<{
        taskId: string
        to: string
        role: string
        spawned: boolean
      }> = []
      if (params.autoDispatch !== false) {
        dispatches = await dispatchAllReadyPipelineStages(db, runtime, pipeline.root.id, {
          waitTimeoutMs: params.waitTimeoutMs ?? 90_000,
          devMode: params.devMode,
          coordinatorHandle: 'orchestrator'
        })
      }

      // Why: set-and-forget — supervisor keeps dispatching unlocked stages + recovering hung agents until done/failed.
      watchProductPipeline(pipeline.root.id, db, runtime, {
        devMode: params.devMode === true,
        pollIntervalMs: 8_000
      })

      return {
        pipelineId: pipeline.root.id,
        root: pipeline.root,
        stages: pipeline.stages,
        worktreeId,
        worktreeCreated,
        issueNumber,
        dispatches,
        supervisor: getProductSupervisorSnapshot(),
        loop: 'research → implement → test → review (auto-rework on FAIL; supervisor watches)'
      }
    }
  }),

  defineMethod({
    name: 'orchestration.productTick',
    params: ProductTickParams,
    handler: async (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const pipelineId = params.pipeline.trim()
      const root = db.getTask(pipelineId)
      if (!root || root.pipeline_id !== root.id) {
        throw new Error(`Unknown product pipeline: ${pipelineId}`)
      }
      const dispatches = await dispatchAllReadyPipelineStages(db, runtime, pipelineId, {
        waitTimeoutMs: params.waitTimeoutMs ?? 90_000,
        devMode: params.devMode,
        coordinatorHandle: 'orchestrator'
      })
      // Keep watching after manual tick so the loop continues without another start.
      watchProductPipeline(pipelineId, db, runtime, {
        devMode: params.devMode === true
      })
      const stages = db.listTasksByPipeline(pipelineId)
      return {
        pipelineId,
        root: db.getTask(pipelineId),
        stages,
        dispatches,
        ready: stages.filter((t) => t.status === 'ready').length,
        dispatched: stages.filter((t) => t.status === 'dispatched').length,
        completed: stages.filter((t) => t.status === 'completed').length,
        failed: stages.filter((t) => t.status === 'failed').length,
        supervisor: getProductSupervisorSnapshot()
      }
    }
  }),

  defineMethod({
    name: 'orchestration.productWatch',
    params: ProductWatchParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      const pipelineId = params.pipeline.trim()
      const root = db.getTask(pipelineId)
      if (!root || root.pipeline_id !== root.id) {
        throw new Error(`Unknown product pipeline: ${pipelineId}`)
      }
      watchProductPipeline(pipelineId, db, runtime, {
        pollIntervalMs: params.pollIntervalMs,
        devMode: params.devMode === true
      })
      return { pipelineId, supervisor: getProductSupervisorSnapshot() }
    }
  }),

  defineMethod({
    name: 'orchestration.productUnwatch',
    params: ProductUnwatchParams,
    handler: (params) => {
      unwatchProductPipeline(params.pipeline)
      return { pipelineId: params.pipeline.trim(), supervisor: getProductSupervisorSnapshot() }
    }
  }),

  defineMethod({
    name: 'orchestration.productSupervisor',
    params: ProductSupervisorParams,
    handler: () => ({
      supervisor: getProductSupervisorSnapshot()
    })
  }),

  defineMethod({
    name: 'orchestration.productStop',
    params: ProductSupervisorParams,
    handler: () => {
      stopProductSupervisor()
      return { supervisor: getProductSupervisorSnapshot() }
    }
  }),

  defineMethod({
    name: 'orchestration.reset',
    params: ResetParams,
    handler: (params, { runtime }) => {
      const db = runtime.getOrchestrationDb()
      if (params.all) {
        db.resetAll()
        return { reset: 'all' }
      }
      if (params.tasks) {
        db.resetTasks()
        return { reset: 'tasks' }
      }
      if (params.messages) {
        db.resetMessages()
        return { reset: 'messages' }
      }
      throw new Error('Invalid reset scope')
    }
  })
]
