import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearAllIssueAiWorkForTests,
  clearIssueAiWork,
  coalesceIssueAiWorkFollowUp,
  getIssueAiWorkEntry,
  registerIssueAiWork,
  updateIssueAiWorkOutcome
} from './issue-ai-work-registry'

const baseEntry = {
  worktreeId: 'wt-1',
  tabId: 'tab-1',
  paneKey: 'tab-1:leaf-1',
  agentLabel: 'claude',
  startedAt: 100,
  mode: 'background' as const
}

const watchEntry = {
  worktreeId: 'wt-1',
  tabId: 'tab-2',
  agentLabel: 'claude',
  startedAt: 200,
  mode: 'watch' as const
}

describe('issue-ai-work-registry', () => {
  beforeEach(() => {
    clearAllIssueAiWorkForTests()
  })

  it('stores an entry and returns it by issue id', () => {
    registerIssueAiWork('gh:1', baseEntry)
    expect(getIssueAiWorkEntry('gh:1')).toEqual(baseEntry)
  })

  it('coalesces follow-ups only while the run is still pending/without outcome', () => {
    registerIssueAiWork('gh:pending', {
      ...baseEntry,
      worktreeId: '',
      paneKey: undefined,
      pendingMessages: ['first']
    })
    const merged = coalesceIssueAiWorkFollowUp({
      issueId: 'gh:pending',
      message: 'second',
      originatorId: 'user-b'
    })
    expect(merged.outcome).toBe('merged')
    expect(getIssueAiWorkEntry('gh:pending')?.pendingMessages).toEqual(['first', 'second'])

    registerIssueAiWork('gh:running', baseEntry)
    expect(coalesceIssueAiWorkFollowUp({ issueId: 'gh:running', message: 'later' }).outcome).toBe(
      'already_running'
    )
  })

  it('records an outcome without dropping the rest of the entry', () => {
    registerIssueAiWork('gh:2', baseEntry)
    updateIssueAiWorkOutcome('gh:2', 'succeeded')
    expect(getIssueAiWorkEntry('gh:2')).toEqual({ ...baseEntry, outcome: 'succeeded' })
  })

  it('ignores outcome updates for unknown issues', () => {
    updateIssueAiWorkOutcome('gh:missing', 'failed')
    expect(getIssueAiWorkEntry('gh:missing')).toBeUndefined()
  })

  it('clears entries so re-launches start clean', () => {
    registerIssueAiWork('gh:3', baseEntry)
    clearIssueAiWork('gh:3')
    expect(getIssueAiWorkEntry('gh:3')).toBeUndefined()
  })

  it('accepts entries without a preassigned pane key (watch mode)', () => {
    registerIssueAiWork('gh:4', watchEntry)
    expect(getIssueAiWorkEntry('gh:4')).toEqual(watchEntry)
    updateIssueAiWorkOutcome('gh:4', 'succeeded')
    expect(getIssueAiWorkEntry('gh:4')?.outcome).toBe('succeeded')
  })
})
