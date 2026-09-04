/**
 * Streaming-reasoning helpers for the in-process pi chat sessions.
 *
 * Two provider shapes reach the chatbox:
 *  1. Native thinking events (`thinking_delta` / `thinking_end` on the SDK's
 *     assistantMessageEvent) — handled by applyThinkingDelta/applyThinkingEnd.
 *  2. Inline `<thinking>…</thinking>` tags embedded in the assistant TEXT
 *     stream — common for local models that emit chain-of-thought as literal
 *     markup. splitInlineThinking parses the accumulating raw stream so the
 *     reasoning bubble grows in realtime while tokens arrive, and the visible
 *     reply stays clean of the tags.
 *
 * Reasoning messages are always inserted BEFORE the assistant message of the
 * same turn so the thinking-aside reads top-down (think → answer).
 */
import { randomUUID } from 'node:crypto'
import type { PiIssueChatEvent, PiIssueChatMessage } from '../../shared/pi-issue-chat-types'

export type ReasoningStreamState = {
  currentReasoningId: string | null
  currentReasoningContent: string
  currentReasoningEmitted: boolean
}

/** Assistant-text streaming state, extended with the reasoning fields so the
 *  inline-<thinking> splitter can manage both messages from one record. */
export type AssistantTextStreamState = ReasoningStreamState & {
  currentAssistantId: string | null
  currentAssistantContent: string
  currentAssistantRaw: string
  currentAssistantEmitted: boolean
}

type Emit = (event: PiIssueChatEvent) => void

const THINKING_OPEN = '<thinking>'
const THINKING_CLOSE = '</thinking>'

/** How many trailing chars of `text` are a partial prefix of `tag`. Used to
 *  hold back a half-streamed `<thinking` / `</thinking` so the raw tag never
 *  flashes in the visible reply. */
function trailingPartialTagLength(text: string, tag: string): number {
  const max = Math.min(tag.length - 1, text.length)
  for (let len = max; len > 0; len -= 1) {
    if (text.endsWith(tag.slice(0, len))) {
      return len
    }
  }
  return 0
}

/** Split an accumulating assistant-text stream into visible reply + reasoning.
 *  Handles closed blocks, an unclosed trailing block (still streaming), and a
 *  partially-arrived tag at the end of the buffer. */
export function splitInlineThinking(raw: string): { visible: string; reasoning: string } {
  let visible = ''
  let reasoning = ''
  let i = 0
  while (i < raw.length) {
    const open = raw.indexOf(THINKING_OPEN, i)
    if (open === -1) {
      const rest = raw.slice(i)
      const hold = trailingPartialTagLength(rest, THINKING_OPEN)
      visible += rest.slice(0, rest.length - hold)
      break
    }
    visible += raw.slice(i, open)
    const close = raw.indexOf(THINKING_CLOSE, open + THINKING_OPEN.length)
    if (close === -1) {
      // Unclosed: the model is still thinking — everything after the open tag
      // is live reasoning, nothing more is visible this tick.
      reasoning += raw.slice(open + THINKING_OPEN.length)
      break
    }
    reasoning += raw.slice(open + THINKING_OPEN.length, close)
    i = close + THINKING_CLOSE.length
  }
  return { visible: visible.trim(), reasoning: reasoning.trim() }
}

/** Insert or update the turn's reasoning message, keeping it above the
 *  assistant message (anchorId) so the aside reads before the reply. */
export function upsertReasoningMessage(
  state: ReasoningStreamState,
  messages: PiIssueChatMessage[],
  content: string,
  anchorAssistantId: string | null,
  sessionId: string,
  emit: Emit
): void {
  state.currentReasoningContent = content
  if (!state.currentReasoningId) {
    state.currentReasoningId = randomUUID()
    const message: PiIssueChatMessage = {
      id: state.currentReasoningId,
      role: 'reasoning',
      content,
      createdAt: Date.now()
    }
    const anchorIdx = anchorAssistantId ? messages.findIndex((m) => m.id === anchorAssistantId) : -1
    if (anchorIdx >= 0) {
      messages.splice(anchorIdx, 0, message)
    } else {
      messages.push(message)
    }
    state.currentReasoningEmitted = true
    emit({ type: 'message', sessionId, message })
    return
  }
  const idx = messages.findIndex((m) => m.id === state.currentReasoningId)
  if (idx >= 0) {
    messages[idx] = { ...messages[idx]!, content }
    emit({ type: 'message', sessionId, message: messages[idx]! })
  }
}

/** Apply a native thinking_delta: create the reasoning message on the first
 *  delta, then stream subsequent deltas onto the existing message. */
export function applyThinkingDelta(
  state: ReasoningStreamState,
  messages: PiIssueChatMessage[],
  delta: string,
  sessionId: string,
  emit: Emit,
  anchorAssistantId: string | null = null
): void {
  state.currentReasoningContent += delta
  if (!state.currentReasoningEmitted) {
    upsertReasoningMessage(
      state,
      messages,
      state.currentReasoningContent,
      anchorAssistantId,
      sessionId,
      emit
    )
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
  emit: Emit,
  anchorAssistantId: string | null = null
): void {
  if (state.currentReasoningEmitted || !content) {
    return
  }
  upsertReasoningMessage(state, messages, content, anchorAssistantId, sessionId, emit)
}

/** Re-derive visible reply + reasoning from the accumulating raw assistant
 *  text and emit upserts for each. Shared by the streaming and final paths. */
function emitSplit(
  state: AssistantTextStreamState,
  messages: PiIssueChatMessage[],
  sessionId: string,
  emit: Emit
): void {
  const { visible, reasoning } = splitInlineThinking(state.currentAssistantRaw)
  if (reasoning) {
    upsertReasoningMessage(state, messages, reasoning, state.currentAssistantId, sessionId, emit)
  }
  if (!visible || !state.currentAssistantId) {
    return
  }
  state.currentAssistantContent = visible
  if (!state.currentAssistantEmitted) {
    const message: PiIssueChatMessage = {
      id: state.currentAssistantId,
      role: 'assistant',
      content: visible,
      createdAt: Date.now()
    }
    messages.push(message)
    state.currentAssistantEmitted = true
    emit({ type: 'message', sessionId, message })
    return
  }
  const idx = messages.findIndex((m) => m.id === state.currentAssistantId)
  if (idx >= 0) {
    messages[idx] = { ...messages[idx]!, content: visible }
    emit({ type: 'message', sessionId, message: messages[idx]! })
  }
}

/** Streaming text_delta: append the token to the raw buffer, then split. */
export function applyAssistantTextStream(
  state: AssistantTextStreamState,
  messages: PiIssueChatMessage[],
  delta: string,
  sessionId: string,
  emit: Emit
): void {
  state.currentAssistantRaw += delta
  emitSplit(state, messages, sessionId, emit)
}

/** Final message_end: the full text arrived at once (no deltas). */
export function applyAssistantFullText(
  state: AssistantTextStreamState,
  messages: PiIssueChatMessage[],
  fullText: string,
  sessionId: string,
  emit: Emit
): void {
  state.currentAssistantRaw = fullText
  emitSplit(state, messages, sessionId, emit)
}
