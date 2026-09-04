import type {
  PiIssueChatEvent,
  PiIssueChatMessage,
  PiIssueChatStatus
} from '../../../../shared/pi-issue-chat-types'

/**
 * Canonical reducer from the Pi SDK event stream to a message list + status.
 * Shared by the issue-chat panel and the voice-call panel so reasoning and
 * tool activity stream and render identically across both surfaces.
 */
export function upsertPiMessage(
  list: PiIssueChatMessage[],
  message: PiIssueChatMessage
): PiIssueChatMessage[] {
  const idx = list.findIndex((m) => m.id === message.id)
  if (idx >= 0) {
    const next = [...list]
    next[idx] = message
    return next
  }
  return [...list, message]
}

export function reducePiEvent(
  messages: PiIssueChatMessage[],
  status: PiIssueChatStatus,
  ev: PiIssueChatEvent
): { messages: PiIssueChatMessage[]; status: PiIssueChatStatus } {
  switch (ev.type) {
    case 'snapshot':
      return { messages: ev.session.messages, status: ev.session.status }
    case 'message':
      return { messages: upsertPiMessage(messages, ev.message), status }
    case 'assistantDelta':
    case 'reasoningDelta':
      return {
        messages: messages.map((m) =>
          m.id === ev.messageId ? { ...m, content: m.content + ev.delta } : m
        ),
        status
      }
    case 'status':
      return { messages, status: ev.status }
    default:
      return { messages, status }
  }
}
