import { describe, expect, it } from 'vitest'
import {
  buildSquadLeaderBriefing,
  findAgentSquad,
  normalizeAgentSquads,
  parseSquadAddress,
  resolveSquadLeader,
  resolveSquadWorkers
} from './agent-squads'

const sample = normalizeAgentSquads([
  {
    id: 'frontend',
    name: 'Frontend Team',
    leader: { agent: 'claude' },
    members: [{ agent: 'claude' }, { agent: 'codex' }, { agent: 'cursor' }],
    routing: 'leader_decide'
  }
])

describe('agent-squads', () => {
  it('normalizes and finds squads by id or name', () => {
    expect(sample).toHaveLength(1)
    expect(findAgentSquad(sample, 'frontend')?.name).toBe('Frontend Team')
    expect(findAgentSquad(sample, 'Frontend Team')?.id).toBe('frontend')
    expect(normalizeAgentSquads([{ id: 'bad', name: '' }])).toEqual([])
  })

  it('resolves leader and workers without duplicating the leader', () => {
    const leader = resolveSquadLeader(sample, 'frontend')
    expect(leader.ok).toBe(true)
    if (leader.ok) {
      expect(leader.leader.agent).toBe('claude')
      expect(leader.isLeaderTask).toBe(true)
    }
    const workers = resolveSquadWorkers(sample, 'frontend')
    expect(workers.ok).toBe(true)
    if (workers.ok) {
      expect(workers.workers.map((member) => member.agent)).toEqual(['codex', 'cursor'])
    }
  })

  it('builds a leader briefing and parses @squad addresses', () => {
    const briefing = buildSquadLeaderBriefing(sample[0]!)
    expect(briefing).toContain('leader of squad "Frontend Team"')
    expect(briefing).toContain('- codex')
    expect(parseSquadAddress('@squad:frontend')).toBe('frontend')
    expect(parseSquadAddress('@claude')).toBeNull()
  })

  it('preserves per-member role, cli, and system prompt through normalization', () => {
    const configured = normalizeAgentSquads([
      {
        id: 'product',
        name: 'Product Team',
        leader: { agent: 'claude', role: 'manager', systemPrompt: 'You manage the team.' },
        members: [
          { agent: 'claude', role: 'manager', cli: 'claude', systemPrompt: 'You manage the team.' },
          { agent: 'codex', role: 'coder', cli: 'codex', systemPrompt: 'Implement features.' },
          { agent: 'pi', role: 'tester', cli: 'pi', systemPrompt: 'Run tests.' }
        ],
        routing: 'leader_decide'
      }
    ])
    expect(configured).toHaveLength(1)
    const squad = configured[0]!
    expect(squad.leader.role).toBe('manager')
    expect(squad.leader.systemPrompt).toBe('You manage the team.')
    const coder = squad.members.find((m) => m.agent === 'codex')!
    expect(coder.role).toBe('coder')
    expect(coder.cli).toBe('codex')
    expect(coder.systemPrompt).toBe('Implement features.')
    const briefing = buildSquadLeaderBriefing(squad)
    expect(briefing).toContain('role: coder')
    expect(briefing).toContain('cli: codex')
    expect(briefing).toContain('Implement features.')
  })
})
