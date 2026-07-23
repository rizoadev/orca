import { describe, expect, it } from 'vitest'
import { classifyDirectHuman } from './agent-run-attribution'
import {
  canCoalesceIntoState,
  formatCoalescedPrompt,
  tryCoalesceFollowUp
} from './agent-followup-coalesce'

describe('agent-followup-coalesce', () => {
  it('only coalesces pending/ready targets', () => {
    expect(canCoalesceIntoState('pending')).toBe(true)
    expect(canCoalesceIntoState('ready')).toBe(true)
    expect(canCoalesceIntoState('running')).toBe(false)
    expect(canCoalesceIntoState('done')).toBe(false)
  })

  it('merges follow-ups into a pending target and reattributes', () => {
    const previous = classifyDirectHuman({ originatorId: 'user-a' })
    const next = classifyDirectHuman({
      originatorId: 'user-b',
      evidenceKind: 'followup',
      evidenceRefId: 'msg-2'
    })
    const result = tryCoalesceFollowUp({
      targetKey: 'issue:github:repo:12',
      state: 'pending',
      existingMessages: ['Fix the flaky test'],
      nextMessage: 'Also update the docs',
      existingAttribution: previous,
      nextAttribution: next
    })
    expect(result.outcome).toBe('merged')
    if (result.outcome === 'merged') {
      expect(result.messages).toEqual(['Fix the flaky test', 'Also update the docs'])
      expect(result.attribution?.originatorId).toBe('user-b')
      expect(result.attribution?.accountableId).toBe('user-b')
    }
  })

  it('refuses running targets without spawning a second plan', () => {
    const result = tryCoalesceFollowUp({
      targetKey: 'pane:tab:leaf',
      state: 'running',
      existingMessages: ['first'],
      nextMessage: 'second'
    })
    expect(result).toEqual({ outcome: 'already_running', targetKey: 'pane:tab:leaf' })
  })

  it('dedupes identical consecutive messages and formats multi-item prompts', () => {
    const merged = tryCoalesceFollowUp({
      targetKey: 'task-1',
      state: 'ready',
      existingMessages: ['Do A', 'Do A'],
      nextMessage: 'Do A'
    })
    expect(merged.outcome).toBe('merged')
    if (merged.outcome === 'merged') {
      expect(merged.messages).toEqual(['Do A'])
      expect(formatCoalescedPrompt(merged.messages)).toBe('Do A')
    }

    const multi = formatCoalescedPrompt(['first', 'second'])
    expect(multi).toContain('Multiple follow-up instructions')
    expect(multi).toContain('1. first')
    expect(multi).toContain('2. second')
  })
})
