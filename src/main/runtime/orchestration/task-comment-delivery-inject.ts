/**
 * Inject / mint dispatch helpers for operator comment delivery.
 */

import type { OrchestrationDb } from './db'
import type { TaskRow } from './types'
import { buildDispatchPreamble } from './preamble'
import type { TuiAgent } from '../../../shared/types'
import { isTuiAgent } from '../../../shared/tui-agent-config'
import {
  buildOperatorFollowUpPrompt,
  formatCoalescedPromptBodies
} from './task-comment-mentions'
import {
  buildDeliveryAuditBody,
  type CommentDeliveryMode,
  type CommentDeliveryTarget
} from './task-comment-delivery'
export type CommentDeliveryRuntime = {
  getClientSettings: () => { agentSquads?: unknown; defaultTuiAgent?: string | null }
  listTerminals: (
    worktreeSelector?: string
  ) => Promise<{
    terminals: { handle: string; title?: string | null; agent?: string | null }[]
  }>
  isTerminalRunningAgent: (handle: string) => Promise<boolean>
  getTerminalPaneKey: (handle: string) => string | null
  getTerminalOrchestrationCliCommand: (handle: string) => 'orca' | 'orca-ide' | string
  sendTerminalAgentPrompt: (handle: string, prompt: string) => Promise<unknown>
  getAgentStatusForHandle?: (handle: string) => string | null
  launchAgentTerminal?: (
    worktreeSelector: string,
    opts: { agent: TuiAgent; prompt: string; title?: string }
  ) => Promise<{ handle: string }>
  waitForTerminal?: (
    handle: string,
    options?: { condition?: string; timeoutMs?: number }
  ) => Promise<unknown>
}

export type DeliverOperatorCommentResult = {
  mode: CommentDeliveryMode
  notified: {
    handle: string
    injected: boolean
    dispatchId?: string
    error?: string
    primary?: boolean
    spawned?: boolean
  }[]
  reassigned: boolean
  reopened: boolean
  coalesced: boolean
  mergedBodies?: string[]
  mentions: import('./task-comment-mentions').CommentMention[]
  warning?: string
}


export async function ensureHandle(
  runtime: CommentDeliveryRuntime,
  task: TaskRow,
  target: CommentDeliveryTarget
): Promise<{ handle: string; spawned: boolean; error?: string }> {
  if (!target.handle.startsWith('__spawn__:')) {
    return { handle: target.handle, spawned: false }
  }
  const agentName = target.spawnAgent?.trim() || target.handle.slice('__spawn__:'.length)
  if (!task.worktree_id) {
    return {
      handle: target.handle,
      spawned: false,
      error: 'Task has no worktree_id — cannot spawn squad agent'
    }
  }
  if (!runtime.launchAgentTerminal) {
    return {
      handle: target.handle,
      spawned: false,
      error: `No live ${agentName} terminal and spawn is unavailable`
    }
  }
  const agent = (isTuiAgent(agentName) ? agentName : 'pi') as TuiAgent
  try {
    const created = await runtime.launchAgentTerminal(`id:${task.worktree_id}`, {
      agent,
      prompt: '',
      title: `comment:${agent}`.slice(0, 40)
    })
    const handle = created.handle
    const deadline = Date.now() + 45_000
    try {
      await runtime.waitForTerminal?.(handle, {
        condition: 'tui-idle',
        timeoutMs: 30_000
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
        handle,
        spawned: true,
        error: `Spawned ${handle} but agent ${agent} never became ready`
      }
    }
    return { handle, spawned: true }
  } catch (err) {
    return {
      handle: target.handle,
      spawned: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function injectFollowUp(
  runtime: CommentDeliveryRuntime,
  db: OrchestrationDb,
  task: TaskRow,
  handle: string,
  author: string,
  bodies: string[]
): Promise<{ handle: string; injected: boolean; dispatchId?: string; error?: string }> {
  try {
    const hasAgent = await runtime.isTerminalRunningAgent(handle)
    if (!hasAgent) {
      return { handle, injected: false, error: 'No recognized agent in terminal' }
    }
    const active = db.getDispatchContext(task.id)
    const commentBody = formatCoalescedPromptBodies(bodies)
    const prompt = buildOperatorFollowUpPrompt({
      taskId: task.id,
      commentBody,
      author,
      taskSpec: task.spec,
      role: task.pipeline_role,
      dispatchId: active?.id ?? null
    })
    await runtime.sendTerminalAgentPrompt(handle, prompt)
    return { handle, injected: true, dispatchId: active?.id }
  } catch (err) {
    return {
      handle,
      injected: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function mintAndInjectDispatch(
  runtime: CommentDeliveryRuntime,
  db: OrchestrationDb,
  task: TaskRow,
  handle: string,
  author: string,
  bodies: string[]
): Promise<{ handle: string; injected: boolean; dispatchId?: string; error?: string }> {
  try {
    const hasAgent = await runtime.isTerminalRunningAgent(handle)
    if (!hasAgent) {
      return { handle, injected: false, error: 'No recognized agent in terminal' }
    }
    if (task.status !== 'ready') {
      return {
        handle,
        injected: false,
        error: `Task is ${task.status}; cannot mint dispatch`
      }
    }
    const ctx = db.createDispatchContext(
      task.id,
      handle,
      runtime.getTerminalPaneKey(handle) ?? undefined
    )
    const followUp = formatCoalescedPromptBodies(bodies)
    const preamble = buildDispatchPreamble({
      taskId: task.id,
      dispatchId: ctx.id,
      taskSpec: `${task.spec}\n\n---\nOperator follow-up:\n${followUp}`,
      coordinatorHandle: author,
      workerHandle: handle,
      cliCommand: runtime.getTerminalOrchestrationCliCommand(handle) as 'orca' | 'orca-ide'
    })
    await runtime.sendTerminalAgentPrompt(handle, preamble)
    return { handle, injected: true, dispatchId: ctx.id }
  } catch (err) {
    return {
      handle,
      injected: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function deliverResolved(input: {
  db: OrchestrationDb
  runtime: CommentDeliveryRuntime
  task: TaskRow
  author: string
  bodies: string[]
  mode: CommentDeliveryMode
  targets: CommentDeliveryTarget[]
  reopen: boolean
  mintDispatch: boolean
  mentions: DeliverOperatorCommentResult['mentions']
  warning?: string
}): Promise<DeliverOperatorCommentResult> {
  let working = input.task
  let didReopen = false
  let reassigned = false

  if (input.reopen) {
    const next = input.db.reopenTask(working.id)
    if (next) {
      working = next
      didReopen = true
    }
  }

  // Resolve spawn placeholders first (sequential — avoid multi-spawn storms).
  const resolvedTargets: (CommentDeliveryTarget & { spawned?: boolean; resolveError?: string })[] =
    []
  for (const target of input.targets) {
    const ensured = await ensureHandle(input.runtime, working, target)
    if (ensured.error && ensured.handle.startsWith('__spawn__:')) {
      resolvedTargets.push({
        ...target,
        handle: ensured.handle,
        spawned: ensured.spawned,
        resolveError: ensured.error
      })
      continue
    }
    resolvedTargets.push({
      ...target,
      handle: ensured.handle,
      spawned: ensured.spawned,
      resolveError: ensured.error
    })
  }

  const usable = resolvedTargets.filter((t) => !t.handle.startsWith('__spawn__:'))
  if (usable.length === 0) {
    return {
      mode: input.mode,
      notified: resolvedTargets.map((t) => ({
        handle: t.handle,
        injected: false,
        error: t.resolveError ?? 'Could not resolve agent terminal',
        primary: t.primary,
        spawned: t.spawned
      })),
      reassigned: false,
      reopened: didReopen,
      coalesced: input.bodies.length > 1,
      mentions: input.mentions,
      warning:
        resolvedTargets.map((t) => t.resolveError).filter(Boolean).join('; ') ||
        'No resolvable agent terminal for mentions'
    }
  }

  const primary = usable.find((t) => t.primary) ?? usable[0]!
  const secondaries = usable.filter((t) => t.handle !== primary.handle)
  const notified: DeliverOperatorCommentResult['notified'] = []

  working = input.db.getTask(working.id) ?? working

  if (input.mintDispatch && working.status === 'ready') {
    const primaryResult = await mintAndInjectDispatch(
      input.runtime,
      input.db,
      working,
      primary.handle,
      input.author,
      input.bodies
    )
    notified.push({
      ...primaryResult,
      primary: true,
      spawned: primary.spawned
    })
    if (primaryResult.injected) {
      reassigned = true
    }
    working = input.db.getTask(working.id) ?? working
  } else {
    let primaryResult = await injectFollowUp(
      input.runtime,
      input.db,
      working,
      primary.handle,
      input.author,
      input.bodies
    )

    // Why: dispatched task with a dead agent looks "in charge" but inject fails;
    // force fail→ready→spawn(optional)→mint so @squad comments still get a response.
    if (!primaryResult.injected && working.status === 'dispatched') {
      input.db.failActiveDispatchForTask(
        working.id,
        primaryResult.error ?? 'Operator comment: agent unresponsive'
      )
      const reopenedTask = input.db.reopenTask(working.id)
      if (reopenedTask) {
        working = reopenedTask
        didReopen = true
      }
      working = input.db.getTask(working.id) ?? working
      if (working.status === 'ready') {
        let handle = primary.handle
        let spawned = primary.spawned
        if (primary.spawnAgent && input.runtime.launchAgentTerminal) {
          const spawnedTarget = await ensureHandle(input.runtime, working, {
            handle: `__spawn__:${primary.spawnAgent}`,
            reason: primary.reason,
            primary: true,
            spawnAgent: primary.spawnAgent
          })
          if (!spawnedTarget.handle.startsWith('__spawn__:')) {
            handle = spawnedTarget.handle
            spawned = spawnedTarget.spawned
          }
        }
        primaryResult = await mintAndInjectDispatch(
          input.runtime,
          input.db,
          working,
          handle,
          input.author,
          input.bodies
        )
        if (primaryResult.injected) {
          reassigned = true
        }
        primaryResult = { ...primaryResult, handle }
        notified.push({
          ...primaryResult,
          primary: true,
          spawned
        })
        working = input.db.getTask(working.id) ?? working
      } else {
        notified.push({
          ...primaryResult,
          primary: true,
          spawned: primary.spawned
        })
      }
    } else {
      notified.push({
        ...primaryResult,
        primary: true,
        spawned: primary.spawned
      })
    }
  }

  if (secondaries.length > 0) {
    const secondaryResults = await Promise.all(
      secondaries.map((t) =>
        injectFollowUp(input.runtime, input.db, working, t.handle, input.author, input.bodies).then(
          (r) => ({ ...r, primary: false, spawned: t.spawned })
        )
      )
    )
    notified.push(...secondaryResults)
  }

  const anyOk = notified.some((n) => n.injected)
  if (anyOk) {
    try {
      input.db.addTaskComment({
        taskId: working.id,
        author: 'system',
        kind: 'system',
        body: buildDeliveryAuditBody(notified)
      })
    } catch {
      // audit is best-effort
    }
  }

  return {
    mode: input.mode,
    notified,
    reassigned,
    reopened: didReopen,
    coalesced: input.bodies.length > 1,
    mergedBodies: input.bodies.length > 1 ? input.bodies : undefined,
    mentions: input.mentions,
    ...(input.warning
      ? { warning: input.warning }
      : !anyOk
        ? {
            warning:
              notified.find((n) => n.error)?.error ??
              'Delivery attempted but no agent accepted the prompt'
          }
        : {})
  }
}

