import { describe, expect, it, vi } from 'vitest'
import {
  applyThinkingDelta,
  applyThinkingEnd,
  type ReasoningStreamState
} from './pi-reasoning-stream'
import type { PiIssueChatEvent, PiIssueChatMessage } from '../../shared/pi-issue-chat-types'

function freshState(): ReasoningStreamState {
  return { currentReasoningId: null, currentReasoningContent: '', currentReasoningEmitted: false }
}

describe('applyThinkingDelta', () => {
  it('creates a reasoning message on the first delta', () => {
    const state = freshState()
    const messages: PiIssueChatMessage[] = []
    const events: PiIssueChatEvent[] = []
    const emit = (e: PiIssueChatEvent) => events.push(e)

    applyThinkingDelta(state, messages, 'thinking hard', 's1', emit)

    expect(messages).toHaveLength(1)
    expect(messages[0]!.role).toBe('reasoning')
    expect(messages[0]!.content).toBe('thinking hard')
    expect(events[0]).toEqual({ type: 'message', sessionId: 's1', message: messages[0] })
    expect(state.currentReasoningEmitted).toBe(true)
  })

  it('appends later deltas via reasoningDelta without new messages', () => {
    const state = freshState()
    const messages: PiIssueChatMessage[] = []
    const events: PiIssueChatEvent[] = []
    const emit = (e: PiIssueChatEvent) => events.push(e)

    applyThinkingDelta(state, messages, 'a', 's1', emit)
    applyThinkingDelta(state, messages, 'b', 's1', emit)

    expect(messages).toHaveLength(1)
    expect(messages[0]!.content).toBe('ab')
    expect(events[1]).toEqual({
      type: 'reasoningDelta',
      sessionId: 's1',
      messageId: messages[0]!.id,
      delta: 'b'
    })
  })

  it('keeps a stable message id across deltas', () => {
    const state = freshState()
    const messages: PiIssueChatMessage[] = []
    const emit = vi.fn()

    applyThinkingDelta(state, messages, 'x', 's1', emit)
    const firstId = state.currentReasoningId
    applyThinkingDelta(state, messages, 'y', 's1', emit)

    expect(state.currentReasoningId).toBe(firstId)
  })
})

describe('applyThinkingEnd', () => {
  it('emits the full content when no deltas arrived', () => {
    const state = freshState()
    const messages: PiIssueChatMessage[] = []
    const events: PiIssueChatEvent[] = []
    const emit = (e: PiIssueChatEvent) => events.push(e)

    applyThinkingEnd(state, messages, 'full thought', 's1', emit)

    expect(messages).toHaveLength(1)
    expect(messages[0]!.role).toBe('reasoning')
    expect(messages[0]!.content).toBe('full thought')
  })

  it('is ignored once deltas already created the message', () => {
    const state = freshState()
    const messages: PiIssueChatMessage[] = []
    const emit = vi.fn()

    applyThinkingDelta(state, messages, 'partial', 's1', emit)
    applyThinkingEnd(state, messages, 'full thought', 's1', emit)

    expect(messages).toHaveLength(1)
    expect(messages[0]!.content).toBe('partial')
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('ignores empty content', () => {
    const state = freshState()
    const messages: PiIssueChatMessage[] = []
    const emit = vi.fn()

    applyThinkingEnd(state, messages, '', 's1', emit)

    expect(messages).toHaveLength(0)
    expect(emit).not.toHaveBeenCalled()
  })
})
