/**
 * Operator comment → agent delivery policy (pure core).
 * Runtime I/O lives in task-comment-delivery-service.ts.
 */

import type { AgentSquad } from '../../../shared/agent-squads'
import { findAgentSquad } from '../../../shared/agent-squads'
import type { TaskCommentKind, TaskRow, TaskStatus } from './types'
import { parseCommentMentions, type CommentMention } from './task-comment-mentions'

/** quiet = thread only; notify = inject follow-up; reassign = reopen + fresh dispatch when needed. */
export type CommentDeliveryMode = 'quiet' | 'notify' | 'reassign'

export type CommentTerminalIndexRow = {
  handle: string
  title?: string | null
  /** True when isTerminalRunningAgent(handle) succeeded (filled by service). */
  runningAgent?: boolean
  /** Best-effort agent id inferred from title / status. */
  agentGuess?: string | null
}

export type CommentDeliveryTarget = {
  handle: string
  reason: 'in_charge' | 'mention_handle' | 'mention_squad' | 'mention_role'
  /** Primary owns re-dispatch; secondaries only get notify inject. */
  primary: boolean
  /** Squad/role agent to spawn when no live terminal matched. */
  spawnAgent?: string | null
}

export type CommentDeliveryPlan = {
  mode: CommentDeliveryMode
  shouldDeliver: boolean
  reopen: boolean
  mintDispatch: boolean
  targets: CommentDeliveryTarget[]
  mentions: CommentMention[]
  warning?: string
  unresolvedMentions: string[]
}

export type ResolveCommentTargetsInput = {
  task: Pick<TaskRow, 'id' | 'status' | 'worktree_id' | 'pipeline_id' | 'pipeline_role'>
  body: string
  /** Last/active dispatch handles newest-first. */
  agentHandles: Array<{ handle: string | null; status: string }>
  /** Pipeline roster rows for @role: resolution. */
  roster: Array<{ role: string | null; assignee: string | null }>
  squads: readonly AgentSquad[]
  /** Terminals for the task worktree (listed once by the service). */
  worktreeTerminals: readonly CommentTerminalIndexRow[]
}

const PASSIVE_AUTHORS = new Set(['system', 'operator-bot', 'orca'])

export function normalizeCommentDeliveryMode(
  raw: string | undefined | null,
  opts?: { notify?: boolean | null; reassign?: boolean | null }
): CommentDeliveryMode {
  const value = raw?.trim().toLowerCase()
  if (value === 'quiet' || value === 'notify' || value === 'reassign') {
    return value
  }
  if (opts?.reassign === true) {
    return 'reassign'
  }
  if (opts?.notify === false) {
    return 'quiet'
  }
  return 'notify'
}

export function isPassiveCommentAuthor(author: string, kind: TaskCommentKind): boolean {
  if (kind !== 'comment') {
    return true
  }
  const a = author.trim().toLowerCase()
  if (!a) {
    return true
  }
  // Explicit human operator is always active.
  if (a === 'operator') {
    return false
  }
  if (PASSIVE_AUTHORS.has(a)) {
    return true
  }
  // Agent terminal handles never auto-notify themselves.
  if (a.startsWith('term_') || a.startsWith('agent_') || a.startsWith('ctx_')) {
    return true
  }
  return false
}

export function shouldDeliverOperatorComment(input: {
  kind: TaskCommentKind
  author: string
  mode: CommentDeliveryMode
}): boolean {
  if (input.mode === 'quiet') {
    return false
  }
  return !isPassiveCommentAuthor(input.author, input.kind)
}

/** Match a live terminal for a squad leader agent (title / guess / any running agent). */
export function matchSquadLeaderTerminal(
  terminals: readonly CommentTerminalIndexRow[],
  leaderAgent: string
): CommentTerminalIndexRow | null {
  const want = leaderAgent.trim().toLowerCase()
  if (!want) {
    return null
  }
  const running = terminals.filter((t) => t.runningAgent)
  const pool = running.length > 0 ? running : terminals

  const byGuess = pool.find((t) => (t.agentGuess ?? '').trim().toLowerCase() === want)
  if (byGuess) {
    return byGuess
  }

  const byTitle = pool.find((t) => titleLooksLikeAgent(t.title, want))
  if (byTitle) {
    return byTitle
  }

  // Last resort: any running agent terminal (better than silent drop).
  return running[0] ?? null
}

export function titleLooksLikeAgent(title: string | null | undefined, agent: string): boolean {
  const t = (title ?? '').toLowerCase()
  const want = agent.trim().toLowerCase()
  if (!t || !want) {
    return false
  }
  return (
    t === want ||
    t.startsWith(`${want} `) ||
    t.startsWith(`${want}:`) ||
    t.startsWith(`${want}·`) ||
    t.startsWith(`${want} ·`) ||
    t.includes(` ${want} `) ||
    t.includes(`/${want}`) ||
    t.endsWith(` ${want}`) ||
    t.includes(want)
  )
}

export function resolveCommentTargets(input: ResolveCommentTargetsInput): {
  targets: CommentDeliveryTarget[]
  mentions: CommentMention[]
  unresolvedMentions: string[]
} {
  const mentions = parseCommentMentions(input.body)
  const byHandle = new Map<string, CommentDeliveryTarget>()
  const unresolvedMentions: string[] = []

  const add = (
    handle: string | null | undefined,
    reason: CommentDeliveryTarget['reason'],
    spawnAgent?: string | null
  ): void => {
    const h = handle?.trim()
    if (!h) {
      return
    }
    if (byHandle.has(h)) {
      return
    }
    byHandle.set(h, {
      handle: h,
      reason,
      primary: false,
      ...(spawnAgent ? { spawnAgent } : {})
    })
  }

  for (const mention of mentions) {
    if (mention.kind === 'handle') {
      add(mention.value, 'mention_handle')
      continue
    }
    if (mention.kind === 'squad') {
      const squad = findAgentSquad(input.squads, mention.value)
      if (!squad) {
        unresolvedMentions.push(`@squad:${mention.value} (unknown squad)`)
        continue
      }
      const match = matchSquadLeaderTerminal(input.worktreeTerminals, squad.leader.agent)
      if (match) {
        add(match.handle, 'mention_squad', squad.leader.agent)
      } else {
        // Placeholder handle resolved later by spawn path (service).
        add(`__spawn__:${squad.leader.agent}`, 'mention_squad', squad.leader.agent)
        unresolvedMentions.push(
          `@squad:${mention.value} (no live ${squad.leader.agent} terminal — will spawn)`
        )
      }
      continue
    }
    if (mention.kind === 'role') {
      const row = input.roster.find(
        (r) => (r.role ?? '').toLowerCase() === mention.value.toLowerCase()
      )
      if (row?.assignee) {
        add(row.assignee, 'mention_role')
      } else {
        unresolvedMentions.push(`@role:${mention.value} (no assignee on roster)`)
      }
    }
  }

  if (byHandle.size === 0) {
    const active =
      input.agentHandles.find((a) => a.status === 'dispatched' && a.handle) ??
      input.agentHandles.find((a) => a.handle) ??
      null
    add(active?.handle, 'in_charge')
  }

  const targets = [...byHandle.values()]
  if (targets.length > 0) {
    const preferred =
      targets.find((t) => t.reason === 'mention_handle') ??
      targets.find((t) => t.reason === 'mention_squad') ??
      targets.find((t) => t.reason === 'mention_role') ??
      targets[0]!
    preferred.primary = true
  }
  return { targets, mentions, unresolvedMentions }
}

export function planCommentDelivery(input: {
  taskStatus: TaskStatus
  mode: CommentDeliveryMode
  targets: CommentDeliveryTarget[]
  shouldDeliver: boolean
  unresolvedMentions?: string[]
}): CommentDeliveryPlan {
  if (!input.shouldDeliver) {
    return {
      mode: input.mode,
      shouldDeliver: false,
      reopen: false,
      mintDispatch: false,
      targets: [],
      mentions: [],
      unresolvedMentions: []
    }
  }
  if (input.targets.length === 0) {
    return {
      mode: input.mode,
      shouldDeliver: true,
      reopen: false,
      mintDispatch: false,
      targets: [],
      mentions: [],
      unresolvedMentions: input.unresolvedMentions ?? [],
      warning:
        input.unresolvedMentions && input.unresolvedMentions.length > 0
          ? `Unresolved mentions: ${input.unresolvedMentions.join('; ')}`
          : 'No agent in charge and no resolvable @mentions'
    }
  }

  const terminal = input.taskStatus === 'completed' || input.taskStatus === 'failed'
  // Mentions / reassign always mint when task is ready or finished so a dead agent gets a real dispatch.
  const reopen = (input.mode === 'reassign' || input.mode === 'notify') && terminal
  const mintDispatch =
    input.mode === 'reassign' ||
    terminal ||
    (input.mode === 'notify' && input.taskStatus === 'ready')

  return {
    mode: input.mode,
    shouldDeliver: true,
    reopen,
    mintDispatch:
      input.mode === 'reassign'
        ? input.taskStatus === 'ready' || terminal
        : mintDispatch && (input.taskStatus === 'ready' || terminal),
    targets: input.targets,
    mentions: [],
    unresolvedMentions: input.unresolvedMentions ?? []
  }
}

export function buildDeliveryAuditBody(
  notified: Array<{ handle: string; injected: boolean }>
): string {
  const ok = notified.filter((n) => n.injected).map((n) => n.handle)
  if (ok.length === 0) {
    return 'Operator comment delivery: no agents injected'
  }
  return `Operator comment delivery → ${ok.join(', ')}`
}
