import { describe, expect, it, vi } from 'vitest'
import {
  applyAssistantFullText,
  applyAssistantTextStream,
  applyThinkingDelta,
  applyThinkingEnd,
  splitInlineThinking,
  upsertReasoningMessage,
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

describe('splitInlineThinking', () => {
  it('returns all text as visible when no tags present', () => {
    expect(splitInlineThinking('hello world')).toEqual({ visible: 'hello world', reasoning: '' })
  })

  it('splits a closed thinking block from the reply', () => {
    const out = splitInlineThinking('<thinking>deep thought</thinking>the answer')
    expect(out.reasoning).toBe('deep thought')
    expect(out.visible).toBe('the answer')
  })

  it('treats an unclosed trailing block as live reasoning', () => {
    const out = splitInlineThinking('<thinking>still thinking')
    expect(out.reasoning).toBe('still thinking')
    expect(out.visible).toBe('')
  })

  it('holds back a partially-streamed open tag from the visible reply', () => {
    const out = splitInlineThinking('answer so far<thi')
    expect(out.visible).toBe('answer so far')
    expect(out.reasoning).toBe('')
  })

  it('handles multiple thinking blocks', () => {
    const out = splitInlineThinking('<thinking>a</thinking>mid<thinking>b</thinking>end')
    expect(out.reasoning).toBe('ab')
    expect(out.visible).toBe('midend')
  })
})

describe('upsertReasoningMessage ordering', () => {
  it('inserts reasoning before the assistant anchor', () => {
    const state = freshState()
    const assistant: PiIssueChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'hi',
      createdAt: 1
    }
    const messages: PiIssueChatMessage[] = [assistant]
    const events: PiIssueChatEvent[] = []
    applyThinkingDelta(state, messages, 'think', 's1', (e) => events.push(e), 'a1')
    expect(messages.map((m) => m.role)).toEqual(['reasoning', 'assistant'])
  })

  it('updates content in place on later deltas without duplicating', () => {
    const state = freshState()
    const messages: PiIssueChatMessage[] = []
    const events: PiIssueChatEvent[] = []
    const emit = (e: PiIssueChatEvent) => events.push(e)
    upsertReasoningMessage(state, messages, 'part1', null, 's1', emit)
    upsertReasoningMessage(state, messages, 'part1 part2', null, 's1', emit)
    expect(messages).toHaveLength(1)
    expect(messages[0]!.content).toBe('part1 part2')
  })
})

describe('applyAssistantTextStream', () => {
  function assistantState() {
    return {
      currentReasoningId: null,
      currentReasoningContent: '',
      currentReasoningEmitted: false,
      currentAssistantId: 'a1',
      currentAssistantContent: '',
      currentAssistantRaw: '',
      currentAssistantEmitted: false
    }
  }

  it('streams plain text into the assistant message', () => {
    const state = assistantState()
    const messages: PiIssueChatMessage[] = []
    const events: PiIssueChatEvent[] = []
    const emit = (e: PiIssueChatEvent) => events.push(e)
    applyAssistantTextStream(state, messages, 'Hel', 's1', emit)
    applyAssistantTextStream(state, messages, 'lo', 's1', emit)
    expect(messages).toHaveLength(1)
    expect(messages[0]!.role).toBe('assistant')
    expect(messages[0]!.content).toBe('Hello')
  })

  it('splits inline thinking into a reasoning message above the reply', () => {
    const state = assistantState()
    const messages: PiIssueChatMessage[] = []
    const emit = vi.fn()
    applyAssistantTextStream(state, messages, '<thinking>plan it', 's1', emit)
    applyAssistantTextStream(state, messages, '</thinking>answer', 's1', emit)
    expect(messages.map((m) => m.role)).toEqual(['reasoning', 'assistant'])
    expect(messages[0]!.content).toBe('plan it')
    expect(messages[1]!.content).toBe('answer')
  })

  it('keeps a half-streamed open tag out of the visible reply', () => {
    const state = assistantState()
    const messages: PiIssueChatMessage[] = []
    const emit = vi.fn()
    applyAssistantTextStream(state, messages, 'hi<think', 's1', emit)
    expect(messages).toHaveLength(1)
    expect(messages[0]!.content).toBe('hi')
  })
})

describe('applyAssistantFullText', () => {
  it('handles a non-streamed message with thinking', () => {
    const state = {
      currentReasoningId: null,
      currentReasoningContent: '',
      currentReasoningEmitted: false,
      currentAssistantId: 'a1',
      currentAssistantContent: '',
      currentAssistantRaw: '',
      currentAssistantEmitted: false
    }
    const messages: PiIssueChatMessage[] = []
    const emit = vi.fn()
    applyAssistantFullText(state, messages, '<thinking>t</thinking>done', 's1', emit)
    expect(messages.map((m) => m.role)).toEqual(['reasoning', 'assistant'])
    expect(messages[1]!.content).toBe('done')
  })
})
