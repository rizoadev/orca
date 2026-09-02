/**
 * Unit tests for the pure Pi chat state reducer.
 */
import { describe, expect, it } from 'vitest'
import {
  applyPiChatEvent,
  foldPiChatEvents,
  initialPiChatState,
  type PiChatLocalState
} from './pi-chat-state'
import type { PiChatEvent, PiChatMessage } from '../../../src/shared/pi-chat-types'

function msg(overrides: Partial<PiChatMessage> = {}): PiChatMessage {
  return {
    id: 'm1',
    role: 'user',
    content: 'hello',
    createdAt: 1_000_000,
    ...overrides
  }
}

function state(overrides: Partial<PiChatLocalState> = {}): PiChatLocalState {
  return { ...initialPiChatState(), ...overrides }
}

describe('snapshot event', () => {
  it('replaces messages, status, error and clears streamingText', () => {
    const initial = state({ streamingText: 'partial', messages: [msg()] })
    const event: PiChatEvent = {
      type: 'snapshot',
      sessionId: 's1',
      session: {
        sessionId: 's1',
        worktreeId: 'w1',
        status: 'running',
        messages: [msg({ id: 'm2', role: 'assistant', content: 'hi' })],
        error: undefined,
        modelId: 'm',
        provider: 'p',
        sessionFile: '/f'
      }
    }
    const next = applyPiChatEvent(initial, event)
    expect(next.messages).toHaveLength(1)
    expect(next.messages[0]!.id).toBe('m2')
    expect(next.status).toBe('running')
    expect(next.streamingText).toBe('')
  })
})

describe('message event', () => {
  it('appends a new message', () => {
    const s = state()
    const event: PiChatEvent = {
      type: 'message',
      sessionId: 's1',
      message: msg({ id: 'new', content: 'world' })
    }
    const next = applyPiChatEvent(s, event)
    expect(next.messages).toHaveLength(1)
    expect(next.messages[0]!.id).toBe('new')
  })

  it('replaces an existing message with the same id', () => {
    const s = state({ messages: [msg({ id: 'x', content: 'old' })] })
    const event: PiChatEvent = {
      type: 'message',
      sessionId: 's1',
      message: msg({ id: 'x', content: 'updated' })
    }
    const next = applyPiChatEvent(s, event)
    expect(next.messages).toHaveLength(1)
    expect(next.messages[0]!.content).toBe('updated')
  })

  it('does not mutate the original messages array', () => {
    const original = [msg({ id: 'a' })]
    const s = state({ messages: original })
    applyPiChatEvent(s, { type: 'message', sessionId: 's1', message: msg({ id: 'b' }) })
    expect(original).toHaveLength(1)
  })
})

describe('assistantDelta event', () => {
  it('appends delta to the matching message content', () => {
    const s = state({ messages: [msg({ id: 'a', role: 'assistant', content: 'He' })] })
    const next = applyPiChatEvent(s, {
      type: 'assistantDelta',
      sessionId: 's1',
      messageId: 'a',
      delta: 'llo'
    })
    expect(next.messages[0]!.content).toBe('Hello')
    expect(next.streamingText).toBe('llo')
  })

  it('accumulates streamingText when messageId is unknown', () => {
    const s = state()
    const next = applyPiChatEvent(s, {
      type: 'assistantDelta',
      sessionId: 's1',
      messageId: 'unknown',
      delta: 'ping'
    })
    expect(next.streamingText).toBe('ping')
    expect(next.messages).toHaveLength(0)
  })

  it('accumulates multiple deltas in order', () => {
    const s = state({ messages: [msg({ id: 'r', role: 'assistant', content: '' })] })
    const result = foldPiChatEvents(
      [
        { type: 'assistantDelta', sessionId: 's1', messageId: 'r', delta: 'a' },
        { type: 'assistantDelta', sessionId: 's1', messageId: 'r', delta: 'b' },
        { type: 'assistantDelta', sessionId: 's1', messageId: 'r', delta: 'c' }
      ],
      s
    )
    expect(result.messages[0]!.content).toBe('abc')
    expect(result.streamingText).toBe('abc')
  })
})

describe('status event', () => {
  it('updates status and error', () => {
    const s = state({ status: 'running' })
    const next = applyPiChatEvent(s, {
      type: 'status',
      sessionId: 's1',
      status: 'error',
      error: 'boom'
    })
    expect(next.status).toBe('error')
    expect(next.error).toBe('boom')
  })

  it('clears streamingText when status transitions to idle', () => {
    const s = state({ status: 'running', streamingText: 'partial...' })
    const next = applyPiChatEvent(s, {
      type: 'status',
      sessionId: 's1',
      status: 'idle',
      error: undefined
    })
    expect(next.streamingText).toBe('')
  })

  it('clears streamingText when status transitions to error', () => {
    const s = state({ status: 'running', streamingText: 'partial...' })
    const next = applyPiChatEvent(s, {
      type: 'status',
      sessionId: 's1',
      status: 'error',
      error: 'failed'
    })
    expect(next.streamingText).toBe('')
  })

  it('preserves streamingText while still running', () => {
    const s = state({ status: 'idle', streamingText: '' })
    const next = applyPiChatEvent(s, {
      type: 'status',
      sessionId: 's1',
      status: 'running',
      error: undefined
    })
    expect(next.streamingText).toBe('')
    expect(next.status).toBe('running')
  })
})

describe('foldPiChatEvents', () => {
  it('applies a full turn sequence correctly', () => {
    const events: PiChatEvent[] = [
      {
        type: 'message',
        sessionId: 's1',
        message: msg({ id: 'u1', role: 'user', content: 'ping' })
      },
      {
        type: 'status',
        sessionId: 's1',
        status: 'running',
        error: undefined
      },
      {
        type: 'message',
        sessionId: 's1',
        message: msg({ id: 'a1', role: 'assistant', content: '' })
      },
      {
        type: 'assistantDelta',
        sessionId: 's1',
        messageId: 'a1',
        delta: 'po'
      },
      {
        type: 'assistantDelta',
        sessionId: 's1',
        messageId: 'a1',
        delta: 'ng'
      },
      {
        type: 'status',
        sessionId: 's1',
        status: 'idle',
        error: undefined
      }
    ]
    const final = foldPiChatEvents(events)
    expect(final.messages).toHaveLength(2)
    expect(final.messages[1]!.content).toBe('pong')
    expect(final.status).toBe('idle')
    expect(final.streamingText).toBe('')
  })
})
