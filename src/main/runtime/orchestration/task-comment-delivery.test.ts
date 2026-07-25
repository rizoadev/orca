import { describe, expect, it } from 'vitest'
import {
  isPassiveCommentAuthor,
  matchSquadLeaderTerminal,
  planCommentDelivery,
  resolveCommentTargets,
  shouldDeliverOperatorComment
} from './task-comment-delivery'
import type { AgentSquad } from '../../../shared/agent-squads'

const squads: AgentSquad[] = [
  {
    id: 'backend',
    name: 'Backend',
    leader: { agent: 'pi' },
    members: [],
    routing: 'leader_decide'
  }
]

describe('task-comment-delivery', () => {
  it('treats operator as active author', () => {
    expect(isPassiveCommentAuthor('operator', 'comment')).toBe(false)
    expect(
      shouldDeliverOperatorComment({ kind: 'comment', author: 'operator', mode: 'notify' })
    ).toBe(true)
  })

  it('resolves @squad via title/running agent without agent field', () => {
    const { targets, unresolvedMentions } = resolveCommentTargets({
      task: {
        id: 'task_1',
        status: 'dispatched',
        worktree_id: 'repo::/wt',
        pipeline_id: null,
        pipeline_role: 'implementer'
      },
      body: 'Please fix retries @squad:backend',
      agentHandles: [{ handle: 'term_old', status: 'dispatched' }],
      roster: [],
      squads,
      worktreeTerminals: [
        { handle: 'term_pi', title: 'pi · backend', runningAgent: true, agentGuess: 'pi' }
      ]
    })
    expect(targets).toEqual([
      expect.objectContaining({
        handle: 'term_pi',
        reason: 'mention_squad',
        primary: true,
        spawnAgent: 'pi'
      })
    ])
    expect(unresolvedMentions).toEqual([])
  })

  it('creates spawn placeholder when no live squad terminal exists', () => {
    const { targets } = resolveCommentTargets({
      task: {
        id: 'task_1',
        status: 'ready',
        worktree_id: 'repo::/wt',
        pipeline_id: null,
        pipeline_role: null
      },
      body: '@squad:backend wake up',
      agentHandles: [],
      roster: [],
      squads,
      worktreeTerminals: []
    })
    expect(targets[0]?.handle).toBe('__spawn__:pi')
    expect(targets[0]?.spawnAgent).toBe('pi')
  })

  it('matches squad leader from title loosely', () => {
    const match = matchSquadLeaderTerminal(
      [{ handle: 't1', title: 'Claude Code', runningAgent: true }],
      'claude'
    )
    expect(match?.handle).toBe('t1')
  })

  it('reopens finished tasks on reassign plan', () => {
    const plan = planCommentDelivery({
      taskStatus: 'failed',
      mode: 'reassign',
      targets: [{ handle: 'term_a', reason: 'mention_squad', primary: true }],
      shouldDeliver: true
    })
    expect(plan.reopen).toBe(true)
    expect(plan.mintDispatch).toBe(true)
  })
})
