// Why: providers like OpenCode emit `part.type === "reasoning"` separately from
// the assistant reply. We coalesce those parts into a single streaming preview
// (NATIVE_CHAT_REASONING_ID) so the chatbox shows a thinking-aside bubble that
// grows alongside the reply, then collapses into a final reasoning row once
// the assistant turn lands in the transcript. Mirrors the streaming-bubble
// pattern in `./native-chat-streaming.ts` so the show/hide rules and
// deduping logic stay symmetric.

import type { NativeChatMessage } from './native-chat-types'

/** Stable id so React list keys and the assembly's dedup pipeline treat the
 *  ephemeral reasoning bubble as a singleton across ticks. */
export const NATIVE_CHAT_REASONING_ID = 'reasoning-streaming'

/** Concatenated text of a reasoning-role message's text blocks, trimmed. */
function reasoningText(message: NativeChatMessage | undefined): string {
  if (!message || message.role !== 'reasoning') {
    return ''
  }
  return message.blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
}

/**
 * Decide the streaming reasoning text to show, or null to hide the bubble.
 * Returns the preview only while the agent is working and the preview leads
 * the most recent reasoning row — so a stale preview never lingers and a
 * transcript row that's already longer hides the synthetic bubble.
 *
 * Working must be true; otherwise a stale preview from a finished turn would
 * stick around until the next turn starts.
 */
export function deriveNativeChatReasoningText(args: {
  messages: readonly NativeChatMessage[]
  previewText: string | null | undefined
  working: boolean
}): string | null {
  const { messages, previewText, working } = args
  if (!working) {
    return null
  }
  const text = previewText?.trim()
  if (!text) {
    return null
  }
  const lastReasoningText = reasoningText(findLastReasoning(messages))
  if (lastReasoningText.includes(text) || text.length <= lastReasoningText.length) {
    return null
  }
  return text
}

/** Build the synthetic streaming reasoning message for the given text. */
export function nativeChatReasoningMessage(text: string): NativeChatMessage {
  return {
    id: NATIVE_CHAT_REASONING_ID,
    role: 'reasoning',
    blocks: [{ type: 'text', text }],
    timestamp: null,
    source: 'hook'
  }
}

function findLastReasoning(messages: readonly NativeChatMessage[]): NativeChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'reasoning' && message.id !== NATIVE_CHAT_REASONING_ID) {
      return message
    }
  }
  return undefined
}
