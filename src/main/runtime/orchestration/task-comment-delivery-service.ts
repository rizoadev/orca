/**
 * Runtime service: plan + deliver operator comments to agents.
 * Resolves @squad/@role/@handle, spawns missing squad agents, injects in parallel.
 */

import type { OrchestrationDb } from './db'
import type { TaskCommentRow } from './types'
import { normalizeAgentSquads } from '../../../shared/agent-squads'
import type { TuiAgent } from '../../../shared/types'
import {
  matchSquadLeaderTerminal,
  normalizeCommentDeliveryMode,
  planCommentDelivery,
  resolveCommentTargets,
  shouldDeliverOperatorComment,
  titleLooksLikeAgent,
  type CommentDeliveryMode,
  type CommentTerminalIndexRow
} from './task-comment-delivery'
import {
  CommentDeliveryCoalescer,
  globalCommentDeliveryCoalescer
} from './task-comment-delivery-coalesce'
import { deliverResolved } from './task-comment-delivery-inject'
import type { RuntimeTerminalWaitCondition } from '../../../shared/runtime-types'

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
    options?: {
      condition?: RuntimeTerminalWaitCondition
      timeoutMs?: number
      signal?: AbortSignal
    }
  ) => Promise<unknown>
}

export type DeliverOperatorCommentInput = {
  taskId: string
  comment: TaskCommentRow
  author: string
  body: string
  mode?: CommentDeliveryMode | string | null
  notify?: boolean | null
  reassign?: boolean | null
  immediate?: boolean
  coalescer?: CommentDeliveryCoalescer
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
  mentions: ReturnType<typeof resolveCommentTargets>['mentions']
  warning?: string
}

async function loadWorktreeTerminals(
  runtime: CommentDeliveryRuntime,
  worktreeId: string | null | undefined
): Promise<CommentTerminalIndexRow[]> {
  if (!worktreeId) {
    return []
  }
  try {
    const { terminals } = await runtime.listTerminals(`id:${worktreeId}`)
    const rows = await Promise.all(
      terminals.map(async (t) => {
        let runningAgent = false
        try {
          runningAgent = await runtime.isTerminalRunningAgent(t.handle)
        } catch {
          runningAgent = false
        }
        const status = runtime.getAgentStatusForHandle?.(t.handle) ?? null
        const agentGuess =
          (typeof t.agent === 'string' && t.agent) ||
          (status && status !== 'none' ? status : null) ||
          guessAgentFromTitle(t.title)
        return {
          handle: t.handle,
          title: t.title ?? null,
          runningAgent,
          agentGuess
        } satisfies CommentTerminalIndexRow
      })
    )
    return rows
  } catch {
    return []
  }
}

function guessAgentFromTitle(title: string | null | undefined): string | null {
  const t = (title ?? '').toLowerCase()
  if (!t) {
    return null
  }
  for (const agent of ['claude', 'codex', 'pi', 'gemini', 'cursor', 'droid', 'opencode', 'aider']) {
    if (titleLooksLikeAgent(title, agent)) {
      return agent
    }
  }
  return null
}

export async function deliverOperatorComment(
  db: OrchestrationDb,
  runtime: CommentDeliveryRuntime,
  input: DeliverOperatorCommentInput
): Promise<DeliverOperatorCommentResult> {
  const task = db.getTask(input.taskId)
  if (!task) {
    throw new Error(`Task not found: ${input.taskId}`)
  }

  const mode = normalizeCommentDeliveryMode(input.mode, {
    notify: input.notify,
    reassign: input.reassign
  })

  if (
    !shouldDeliverOperatorComment({
      kind: input.comment.kind,
      author: input.author,
      mode
    })
  ) {
    return {
      mode,
      notified: [],
      reassigned: false,
      reopened: false,
      coalesced: false,
      mentions: []
    }
  }

  const worktreeTerminals = await loadWorktreeTerminals(runtime, task.worktree_id)
  const squads = normalizeAgentSquads(runtime.getClientSettings().agentSquads)
  const agents = db.listTaskAgents(task.id)
  const roster = task.pipeline_id != null ? db.listPipelineRoster(task.pipeline_id) : []

  const { targets, mentions, unresolvedMentions } = resolveCommentTargets({
    task,
    body: input.body,
    agentHandles: agents.map((a) => ({ handle: a.handle, status: a.status })),
    roster: roster.map((r) => ({ role: r.role, assignee: r.assignee })),
    squads,
    worktreeTerminals
  })

  // Mentions force reassign-style delivery so finished/dead tasks wake up.
  const effectiveMode: CommentDeliveryMode =
    mentions.length > 0 && mode === 'notify' ? 'reassign' : mode

  const plan = planCommentDelivery({
    taskStatus: task.status,
    mode: effectiveMode,
    targets,
    shouldDeliver: true,
    unresolvedMentions
  })
  plan.mentions = mentions

  if (plan.targets.length === 0) {
    return {
      mode: effectiveMode,
      notified: [],
      reassigned: false,
      reopened: false,
      coalesced: false,
      mentions,
      warning: plan.warning
    }
  }

  const primary = plan.targets.find((t) => t.primary) ?? plan.targets[0]!
  const coalescer = input.coalescer ?? globalCommentDeliveryCoalescer
  // Never debounce when mentions present — operator expects immediate squad wake.
  const useCoalesce =
    effectiveMode === 'notify' &&
    mentions.length === 0 &&
    !input.immediate &&
    !plan.mintDispatch

  const run = (bodies: string[]): Promise<DeliverOperatorCommentResult> =>
    deliverResolved({
      db,
      runtime,
      task,
      author: input.author,
      bodies,
      mode: effectiveMode,
      targets: plan.targets,
      reopen: plan.reopen,
      mintDispatch: plan.mintDispatch,
      mentions,
      warning: plan.warning
    })

  if (!useCoalesce) {
    return run([input.body])
  }

  const key = CommentDeliveryCoalescer.key(task.id, primary.handle, effectiveMode)
  const flushed = await coalescer.enqueue(key, input.body, run)
  return {
    ...flushed.result,
    coalesced: flushed.mergedBodies.length > 1 || flushed.result.coalesced,
    mergedBodies:
      flushed.mergedBodies.length > 1 ? flushed.mergedBodies : flushed.result.mergedBodies
  }
}

// Re-export for tests that import match helper through service.
export { matchSquadLeaderTerminal }
