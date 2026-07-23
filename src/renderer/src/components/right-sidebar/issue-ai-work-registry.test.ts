import { describe, expect, it, beforeEach } from 'vitest'
import {
  clearAllIssueAiWorkForTests,
  clearIssueAiWork,
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
