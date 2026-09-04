/**
 * Streaming-reasoning state machine for the in-process pi chat sessions.
 * Mirrors the assistant text_delta path: first delta creates a 'reasoning'
 * message, later deltas append via a reasoningDelta event so the chatbox can
 * render a live thinking-aside. Extracted from issue-chat-session to keep
 * that module focused on session lifecycle.
 */
import { randomUUID } from 'node:crypto'
import type { PiIssueChatEvent, PiIssueChatMessage } from '../../shared/pi-issue-chat-types'

export type ReasoningStreamState = {
  currentReasoningId: string | null
  currentReasoningContent: string
  currentReasoningEmitted: boolean
}

type Emit = (event: PiIssueChatEvent) => void

/** Apply a thinking_delta: create the reasoning message on the first delta,
 *  then stream subsequent deltas onto the existing message. Mutates `state`
 *  and `messages` in place. */
export function applyThinkingDelta(
  state: ReasoningStreamState,
  messages: PiIssueChatMessage[],
  delta: string,
  sessionId: string,
  emit: Emit
): void {
  state.currentReasoningContent += delta
  if (!state.currentReasoningEmitted) {
    state.currentReasoningId = state.currentReasoningId ?? randomUUID()
    const message: PiIssueChatMessage = {
      id: state.currentReasoningId,
      role: 'reasoning',
      content: state.currentReasoningContent,
      createdAt: Date.now()
    }
    messages.push(message)
    state.currentReasoningEmitted = true
    emit({ type: 'message', sessionId, message })
    return
  }
  if (!state.currentReasoningId) {
    return
  }
  const idx = messages.findIndex((m) => m.id === state.currentReasoningId)
  if (idx >= 0) {
    messages[idx] = { ...messages[idx]!, content: state.currentReasoningContent }
  }
  emit({ type: 'reasoningDelta', sessionId, messageId: state.currentReasoningId, delta })
}

/** Non-streaming fallback: some providers emit only thinking_end with the full
 *  content. Ignored once deltas already created the message. */
export function applyThinkingEnd(
  state: ReasoningStreamState,
  messages: PiIssueChatMessage[],
  content: string,
  sessionId: string,
  emit: Emit
): void {
  if (state.currentReasoningEmitted || !content) {
    return
  }
  state.currentReasoningId = state.currentReasoningId ?? randomUUID()
  state.currentReasoningContent = content
  const message: PiIssueChatMessage = {
    id: state.currentReasoningId,
    role: 'reasoning',
    content,
    createdAt: Date.now()
  }
  messages.push(message)
  state.currentReasoningEmitted = true
  emit({ type: 'message', sessionId, message })
}
