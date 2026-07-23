import { isCursorAgentTitle } from '../../../shared/agent-title-core'
import { buildAgentNameRe } from '../../../shared/agent-name-token-match'
import type { RuntimeTerminalSummary } from '../../../shared/runtime-types'
import {
  normalizeAgentSquads,
  parseSquadAddress,
  resolveSquadLeader,
  resolveSquadWorkers,
  type AgentSquad
} from '../../../shared/agent-squads'

// Why: group addresses enable broadcast messaging to logical groups of agents.
// Resolution is done at send-time: one message record per recipient, same thread_id,
// so each recipient gets their own read-tracking (Section 4.5).

const AGENT_NAME_GROUPS = [
  'claude',
  'openclaude',
  'codex',
  'opencode',
  'mimo',
  'gemini',
  'droid',
  'grok',
  'cursor'
] as const

type AgentNameGroup = (typeof AGENT_NAME_GROUPS)[number]

export type GroupAddress =
  | '@all'
  | '@idle'
  | `@${AgentNameGroup}`
  | `@worktree:${string}`
  | `@squad:${string}`

export function isGroupAddress(to: string): boolean {
  return to.startsWith('@')
}

// Why: a name token identifies an agent only when the name is a coined word. `cursor` is
// also ordinary vocabulary in another agent's task-summary title ("fix the text cursor
// blink"), so token-matching it would route @cursor into a live Claude/Codex prompt. Names
// with that ambiguity register the identity predicate delivery already applies to them.
const GROUP_TITLE_MATCHERS: Partial<Record<AgentNameGroup, (title: string) => boolean>> = {
  cursor: isCursorAgentTitle
}

function titleMatchesAgentNameGroup(title: string, agentName: string): boolean {
  const identityMatcher = GROUP_TITLE_MATCHERS[agentName as AgentNameGroup]
  if (identityMatcher) {
    return identityMatcher(title)
  }
  // Why: reuse the shared whole-token matcher so orchestration groups honor the
  // same Windows launcher-suffix rule (e.g. `grok.exe`) as the rest of Orca's
  // agent-title detection, instead of maintaining a divergent regex here.
  return buildAgentNameRe(agentName).test(title)
}

export function resolveGroupAddress(
  to: string,
  senderHandle: string,
  terminals: RuntimeTerminalSummary[],
  getAgentStatus: (handle: string) => string | null,
  // Why: optional so existing callers stay source-compatible; squads only resolve when provided.
  squads?: readonly AgentSquad[] | unknown
): string[] {
  if (!isGroupAddress(to)) {
    return [to]
  }

  const group = to.toLowerCase()

  if (group === '@all') {
    // Why: @all broadcasts to every terminal except the sender to avoid self-delivery loops.
    return terminals.map((t) => t.handle).filter((h) => h !== senderHandle)
  }

  if (group === '@idle') {
    // Why: @idle targets only agents whose TUI reports idle status, useful for
    // dispatching work to available agents without interrupting busy ones.
    return terminals
      .filter((t) => t.handle !== senderHandle && getAgentStatus(t.handle) === 'idle')
      .map((t) => t.handle)
  }

  // @worktree:<id> — all handles in a specific worktree
  if (group.startsWith('@worktree:')) {
    const worktreeId = to.slice('@worktree:'.length)
    return terminals
      .filter((t) => t.handle !== senderHandle && t.worktreeId === worktreeId)
      .map((t) => t.handle)
  }

  // @squad:<id|name> — leader_decide routes to leader terminals; idle_first prefers idle members.
  const squadKey = parseSquadAddress(to)
  if (squadKey) {
    const normalized = normalizeAgentSquads(squads ?? [])
    const leader = resolveSquadLeader(normalized, squadKey)
    if (!leader.ok) {
      return []
    }
    const matchAgent = (agentName: string): string[] =>
      terminals
        .filter((t) => {
          if (t.handle === senderHandle) {
            return false
          }
          return titleMatchesAgentNameGroup(t.title ?? '', agentName)
        })
        .map((t) => t.handle)

    if (leader.squad.routing === 'idle_first') {
      const workers = resolveSquadWorkers(normalized, squadKey)
      const candidates = workers.ok ? [leader.leader, ...workers.workers] : [leader.leader]
      const idle: string[] = []
      for (const member of candidates) {
        for (const handle of matchAgent(member.agent)) {
          if (getAgentStatus(handle) === 'idle') {
            idle.push(handle)
          }
        }
      }
      if (idle.length > 0) {
        return Array.from(new Set(idle))
      }
    }

    // Why: default leader_decide (and round_robin without live counters) targets the leader role.
    return Array.from(new Set(matchAgent(leader.leader.agent)))
  }

  // Why: agent-name groups (@claude, @droid, etc.) match by terminal title so
  // the sender can address all instances of a particular agent type without
  // knowing their handles.
  const agentName = group.slice(1) // remove @
  if ((AGENT_NAME_GROUPS as readonly string[]).includes(agentName)) {
    return terminals
      .filter((t) => {
        if (t.handle === senderHandle) {
          return false
        }
        return titleMatchesAgentNameGroup(t.title ?? '', agentName)
      })
      .map((t) => t.handle)
  }

  // Why: unknown groups resolve to empty rather than throwing so callers can
  // distinguish "valid group, no current members" from programming errors.
  return []
}
