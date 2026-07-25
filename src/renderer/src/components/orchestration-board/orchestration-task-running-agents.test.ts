import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import {
  collectOrchestrationTaskRunningAgents,
  summarizeRunningAgents
} from './orchestration-task-running-agents'

function entry(
  partial: Partial<AgentStatusEntry> & Pick<AgentStatusEntry, 'paneKey' | 'state'>
): AgentStatusEntry {
  return {
    prompt: '',
    updatedAt: Date.now(),
    stateStartedAt: Date.now(),
    stateHistory: [],
    ...partial
  }
}

describe('collectOrchestrationTaskRunningAgents', () => {
  it('finds working agents bound to the task id', () => {
    const agents = collectOrchestrationTaskRunningAgents({
      taskId: 'task_1',
      agentStatusByPaneKey: {
        't:a': entry({
          paneKey: 't:a',
          state: 'working',
          agentType: 'pi',
          model: 'kimi',
          terminalHandle: 'term_pi',
          orchestration: {
            taskId: 'task_1',
            dispatchId: 'ctx_1'
          }
        }),
        't:b': entry({
          paneKey: 't:b',
          state: 'done',
          agentType: 'claude',
          orchestration: { taskId: 'task_1', dispatchId: 'ctx_old' }
        }),
        't:c': entry({
          paneKey: 't:c',
          state: 'working',
          agentType: 'codex',
          orchestration: { taskId: 'task_other', dispatchId: 'ctx_x' }
        })
      }
    })
    expect(agents).toHaveLength(1)
    expect(agents[0]?.agentType).toBe('pi')
    expect(summarizeRunningAgents(agents)).toEqual({
      workingCount: 1,
      total: 1,
      agentTypes: ['pi']
    })
  })

  it('includes roster sibling tasks under a pipeline', () => {
    const agents = collectOrchestrationTaskRunningAgents({
      taskId: 'root',
      pipelineId: 'root',
      roster: [
        {
          taskId: 'stage_impl',
          stage: 'implement',
          role: 'implementer',
          status: 'dispatched',
          title: null,
          assignee: 'term_impl',
          dispatchStatus: 'dispatched',
          attempt: 1
        }
      ],
      agentStatusByPaneKey: {
        't:impl': entry({
          paneKey: 't:impl',
          state: 'working',
          agentType: 'claude',
          terminalHandle: 'term_impl',
          orchestration: { taskId: 'stage_impl', dispatchId: 'ctx_2' }
        })
      }
    })
    expect(agents.map((a) => a.agentType)).toEqual(['claude'])
  })

  it('matches by assignee handle when orchestration context is missing', () => {
    const agents = collectOrchestrationTaskRunningAgents({
      taskId: 'task_x',
      assigneeHandles: ['term_worker'],
      agentStatusByPaneKey: {
        't:w': entry({
          paneKey: 't:w',
          state: 'working',
          agentType: 'codex',
          model: 'gpt',
          terminalHandle: 'term_worker',
          toolName: 'Bash'
        })
      }
    })
    expect(agents).toEqual([
      expect.objectContaining({
        agentType: 'codex',
        model: 'gpt',
        handle: 'term_worker',
        toolName: 'Bash',
        state: 'working'
      })
    ])
  })
})
