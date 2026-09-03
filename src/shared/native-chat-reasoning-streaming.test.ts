import { describe, expect, it } from 'vitest'
import {
  NATIVE_CHAT_REASONING_ID,
  deriveNativeChatReasoningText,
  nativeChatReasoningMessage
} from './native-chat-reasoning-streaming'
import type { NativeChatMessage } from './native-chat-types'

function makeReasoning(text: string, id = 'r1'): NativeChatMessage {
  return {
    id,
    role: 'reasoning',
    blocks: [{ type: 'text', text }],
    timestamp: 1,
    source: 'transcript'
  }
}

describe('deriveNativeChatReasoningText', () => {
  const working = true

  it('returns null when not working even if preview is set', () => {
    const out = deriveNativeChatReasoningText({
      messages: [],
      previewText: 'thinking hard...',
      working: false
    })
    expect(out).toBeNull()
  })

  it('returns null when preview is missing', () => {
    const out = deriveNativeChatReasoningText({
      messages: [],
      previewText: undefined,
      working
    })
    expect(out).toBeNull()
  })

  it('returns null when preview is whitespace-only', () => {
    const out = deriveNativeChatReasoningText({
      messages: [],
      previewText: '   ',
      working
    })
    expect(out).toBeNull()
  })

  it('returns trimmed preview when there is no transcript reasoning yet', () => {
    const out = deriveNativeChatReasoningText({
      messages: [],
      previewText: '  weighing options  ',
      working
    })
    expect(out).toBe('weighing options')
  })

  it('hides when the transcript reasoning row already covers the preview', () => {
    const out = deriveNativeChatReasoningText({
      messages: [makeReasoning('weighing options, looking at trade-offs')],
      previewText: 'weighing options',
      working
    })
    expect(out).toBeNull()
  })

  it('hides when the preview is not longer than the transcript reasoning row', () => {
    const out = deriveNativeChatReasoningText({
      messages: [makeReasoning('short')],
      previewText: 'short',
      working
    })
    expect(out).toBeNull()
  })

  it('emits the preview when it extends the latest transcript reasoning row', () => {
    const out = deriveNativeChatReasoningText({
      messages: [makeReasoning('weighing options,')],
      previewText: 'weighing options, looking at trade-offs',
      working
    })
    expect(out).toBe('weighing options, looking at trade-offs')
  })

  it('only inspects the last reasoning row in the conversation', () => {
    const out = deriveNativeChatReasoningText({
      messages: [
        makeReasoning('thinking earlier'),
        makeReasoning('recent thoughts'),
        {
          id: 'u1',
          role: 'user',
          blocks: [{ type: 'text', text: 'go on' }],
          timestamp: 2,
          source: 'transcript'
        }
      ],
      previewText: 'recent thoughts about metrics',
      working
    })
    expect(out).toBe('recent thoughts about metrics')
  })

  it('ignores the synthetic streaming reasoning bubble when measuring latest length', () => {
    const out = deriveNativeChatReasoningText({
      messages: [
        makeReasoning('earlier reasoning'),
        nativeChatReasoningMessage('streaming bubble')
      ],
      previewText: 'much later reasoning than the streaming bubble',
      working
    })
    expect(out).toBe('much later reasoning than the streaming bubble')
  })
})

describe('nativeChatReasoningMessage', () => {
  it('uses the stable NATIVE_CHAT_REASONING_ID', () => {
    const message = nativeChatReasoningMessage('hello')
    expect(message.id).toBe(NATIVE_CHAT_REASONING_ID)
    expect(message.id).toBe('reasoning-streaming')
  })

  it('marks the role as reasoning with hook source', () => {
    const message = nativeChatReasoningMessage('hello')
    expect(message.role).toBe('reasoning')
    expect(message.source).toBe('hook')
    expect(message.timestamp).toBeNull()
    expect(message.blocks).toEqual([{ type: 'text', text: 'hello' }])
  })
})
