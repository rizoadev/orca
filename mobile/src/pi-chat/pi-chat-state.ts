/**
 * Pure state-reduction helpers for the mobile Pi chat controller.
 * Extracted so they can be unit-tested without a React environment.
 */
import type { PiChatEvent, PiChatMessage, PiChatStatus } from '../../../src/shared/pi-chat-types'

export type PiChatLocalState = {
  messages: PiChatMessage[]
  status: PiChatStatus
  error: string | undefined
  streamingText: string
}

export function initialPiChatState(): PiChatLocalState {
  return { messages: [], status: 'idle', error: undefined, streamingText: '' }
}

/**
 * Apply one PiChatEvent to local state. Returns the next state.
 * Pure — no side-effects, no mutation of the input state.
 */
export function applyPiChatEvent(state: PiChatLocalState, event: PiChatEvent): PiChatLocalState {
  switch (event.type) {
    case 'snapshot': {
      return {
        messages: event.session.messages,
        status: event.session.status,
        error: event.session.error,
        streamingText: ''
      }
    }
    case 'message': {
      const idx = state.messages.findIndex((m) => m.id === event.message.id)
      const messages =
        idx >= 0
          ? state.messages.map((m, i) => (i === idx ? event.message : m))
          : [...state.messages, event.message]
      return { ...state, messages }
    }
    case 'assistantDelta': {
      const idx = state.messages.findIndex((m) => m.id === event.messageId)
      if (idx < 0) {
        // Delta for unknown message — accumulate streaming text only.
        return { ...state, streamingText: state.streamingText + event.delta }
      }
      const messages = state.messages.map((m, i) =>
        i === idx ? { ...m, content: m.content + event.delta } : m
      )
      return {
        ...state,
        messages,
        streamingText: state.streamingText + event.delta
      }
    }
    case 'status': {
      const clearing = event.status === 'idle' || event.status === 'error'
      return {
        ...state,
        status: event.status,
        error: event.error,
        streamingText: clearing ? '' : state.streamingText
      }
    }
    default:
      return state
  }
}

/**
 * Fold a sequence of events over an initial state. Useful in tests.
 */
export function foldPiChatEvents(
  events: PiChatEvent[],
  initial: PiChatLocalState = initialPiChatState()
): PiChatLocalState {
  return events.reduce(applyPiChatEvent, initial)
}
