// Why: named agent squads with a designated leader — Orca-native routing layer
// on top of existing orchestration groups (@all/@idle/@claude).

import type { TuiAgent } from './types'

export type AgentSquadMember = {
  agent: TuiAgent
  /** Optional profile/label for multi-account agents. */
  profile?: string
  /** Role within the squad, e.g. 'coder' | 'tester' | 'researcher'. */
  role?: string
  /** Custom system prompt for this member/role. */
  systemPrompt?: string
  /** Preferred CLI (agent command) for this member. */
  cli?: string
}

export type AgentSquadRouting = 'leader_decide' | 'idle_first' | 'round_robin'

export type AgentSquad = {
  id: string
  name: string
  leader: AgentSquadMember
  members: AgentSquadMember[]
  routing: AgentSquadRouting
  maxConcurrent?: number
}

export type ResolveSquadLeaderResult =
  | { ok: true; squad: AgentSquad; leader: AgentSquadMember; isLeaderTask: true }
  | { ok: false; reason: string }

export type ResolveSquadWorkersResult =
  | { ok: true; workers: AgentSquadMember[] }
  | { ok: false; reason: string }

const SQUAD_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i

// Why: normalized member shape shared by leader and members so both carry the
// same per-agent config (role / systemPrompt / cli).
function normalizeSquadMember(member: Partial<AgentSquadMember>): AgentSquadMember {
  const next: AgentSquadMember = { agent: member.agent as TuiAgent }
  if (member.profile) {
    next.profile = member.profile
  }
  if (member.role) {
    next.role = member.role
  }
  if (member.systemPrompt) {
    next.systemPrompt = member.systemPrompt
  }
  if (member.cli) {
    next.cli = member.cli
  }
  return next
}

export function isValidAgentSquadId(id: string): boolean {
  return SQUAD_ID_RE.test(id.trim())
}

export function normalizeAgentSquad(raw: unknown): AgentSquad | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const value = raw as Partial<AgentSquad>
  if (typeof value.id !== 'string' || !isValidAgentSquadId(value.id)) {
    return null
  }
  if (typeof value.name !== 'string' || value.name.trim().length === 0) {
    return null
  }
  if (!value.leader || typeof value.leader !== 'object' || typeof value.leader.agent !== 'string') {
    return null
  }
  const members = Array.isArray(value.members)
    ? value.members.filter(
        (member): member is AgentSquadMember =>
          !!member && typeof member === 'object' && typeof member.agent === 'string'
      )
    : []
  const routing: AgentSquadRouting =
    value.routing === 'idle_first' || value.routing === 'round_robin'
      ? value.routing
      : 'leader_decide'

  return {
    id: value.id.trim(),
    name: value.name.trim(),
    leader: normalizeSquadMember(value.leader),
    members: members.map(normalizeSquadMember),
    routing,
    ...(typeof value.maxConcurrent === 'number' && value.maxConcurrent > 0
      ? { maxConcurrent: Math.floor(value.maxConcurrent) }
      : {})
  }
}

export function normalizeAgentSquads(raw: unknown): AgentSquad[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const seen = new Set<string>()
  const out: AgentSquad[] = []
  for (const entry of raw) {
    const squad = normalizeAgentSquad(entry)
    if (!squad || seen.has(squad.id)) {
      continue
    }
    seen.add(squad.id)
    out.push(squad)
  }
  return out
}

export function findAgentSquad(squads: readonly AgentSquad[], idOrName: string): AgentSquad | null {
  const key = idOrName.trim().toLowerCase()
  if (!key) {
    return null
  }
  return (
    squads.find((squad) => squad.id.toLowerCase() === key || squad.name.toLowerCase() === key) ??
    null
  )
}

export function resolveSquadLeader(
  squads: readonly AgentSquad[],
  idOrName: string
): ResolveSquadLeaderResult {
  const squad = findAgentSquad(squads, idOrName)
  if (!squad) {
    return { ok: false, reason: `Unknown squad: ${idOrName}` }
  }
  return { ok: true, squad, leader: squad.leader, isLeaderTask: true }
}

export function resolveSquadWorkers(
  squads: readonly AgentSquad[],
  idOrName: string
): ResolveSquadWorkersResult {
  const squad = findAgentSquad(squads, idOrName)
  if (!squad) {
    return { ok: false, reason: `Unknown squad: ${idOrName}` }
  }
  // Why: leader is coordinator; workers are everyone else (members minus leader).
  const leaderKey = `${squad.leader.agent}\0${squad.leader.profile ?? ''}`
  const workers = squad.members.filter(
    (member) => `${member.agent}\0${member.profile ?? ''}` !== leaderKey
  )
  return { ok: true, workers }
}

/** Briefing injected into a squad-leader launch prompt. */
export function buildSquadLeaderBriefing(squad: AgentSquad): string {
  const workers = resolveSquadWorkers([squad], squad.id)
  const formatMember = (member: AgentSquadMember): string => {
    const bits: string[] = []
    if (member.role) {
      bits.push(`role: ${member.role}`)
    }
    const profile = member.profile ? ` (${member.profile})` : ''
    if (member.cli) {
      bits.push(`cli: ${member.cli}`)
    }
    const config = bits.length > 0 ? ` [${bits.join(', ')}]` : ''
    let line = `- ${member.agent}${profile}${config}`
    if (member.systemPrompt) {
      line += `\n    system prompt: ${member.systemPrompt}`
    }
    return line
  }
  const workerLines =
    workers.ok && workers.workers.length > 0
      ? workers.workers.map(formatMember)
      : ['- (no dedicated workers; you may use @idle / agent-name groups)']

  return [
    `You are the leader of squad "${squad.name}" (id: ${squad.id}).`,
    `Routing policy: ${squad.routing}.`,
    squad.maxConcurrent ? `Max concurrent workers: ${squad.maxConcurrent}.` : null,
    'Your job: plan, delegate, and integrate. Prefer dispatching concrete work to workers instead of doing everything yourself.',
    'Workers:',
    ...workerLines,
    'Use Orca orchestration (`orca orchestration dispatch`, messages, gates) to coordinate.'
  ]
    .filter(Boolean)
    .join('\n')
}

/** Parse `@squad:<id|name>` addresses used by orchestration send/dispatch. */
export function parseSquadAddress(to: string): string | null {
  const trimmed = to.trim()
  if (!trimmed.toLowerCase().startsWith('@squad:')) {
    return null
  }
  const id = trimmed.slice('@squad:'.length).trim()
  return id.length > 0 ? id : null
}
