/**
 * Resolve the agent (and optional member cli/systemPrompt) for a product
 * pipeline stage. Prefers the squad member whose role matches the stage.
 */

import {
  buildSquadLeaderBriefing,
  findAgentSquad,
  normalizeAgentSquads
} from '../../../shared/agent-squads'
import { defaultRoleBindings, type PipelineRoleBinding } from './product-pipeline-engine'
import type { ProductPipelineRole } from '../../../shared/product-pipeline'
import {
  DEFAULT_AGENT_FAILOVER_CHAIN,
  pickFailoverAgent
} from '../../../shared/orchestration-blocker-policy'
import type { TuiAgent } from '../../../shared/types'
import { isTuiAgent } from '../../../shared/tui-agent-config'

export type ResolvedPipelineRoleAgent = {
  agent: TuiAgent
  squadId: string
  briefing?: string
  preferredAgent: string
  cli?: string
  memberSystemPrompt?: string
}

export function resolveAgentForRole(
  role: ProductPipelineRole,
  runtime: { getClientSettings: () => { agentSquads?: unknown; defaultTuiAgent?: string | null } },
  bindings: PipelineRoleBinding[] = defaultRoleBindings(),
  /** 1-based attempt — used for model/agent failover chain. */
  attempt = 1
): ResolvedPipelineRoleAgent {
  const binding =
    bindings.find((b) => b.role === role) ??
    defaultRoleBindings().find((b) => b.role === 'implementer') ??
    defaultRoleBindings()[0]!
  const settings = runtime.getClientSettings()
  const squads = normalizeAgentSquads(settings.agentSquads)
  const squad = findAgentSquad(squads, binding.squadId)
  const defaultAgent = settings.defaultTuiAgent?.trim() || binding.defaultAgent
  // Why: prefer the member whose role matches this pipeline stage over the bare squad leader.
  const roleMember =
    squad?.members.find((member) => member.role?.trim().toLowerCase() === role.toLowerCase()) ||
    null
  const preferred = roleMember?.agent || squad?.leader.agent || defaultAgent
  // Build chain: preferred → squad members → global failover defaults.
  const memberAgents = (squad?.members ?? []).map((m) => m.agent)
  const chain = [preferred, ...memberAgents, ...DEFAULT_AGENT_FAILOVER_CHAIN].filter(
    (name, index, arr) => name && arr.indexOf(name) === index
  )
  const agentName = pickFailoverAgent(preferred, attempt, chain)
  const agent = (isTuiAgent(agentName) ? agentName : 'pi') as TuiAgent
  return {
    agent,
    preferredAgent: preferred,
    squadId: binding.squadId,
    briefing: squad ? buildSquadLeaderBriefing(squad) : undefined,
    cli: roleMember?.cli || undefined,
    memberSystemPrompt: roleMember?.systemPrompt || undefined
  }
}
