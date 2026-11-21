import type { PiIssueChatMessage } from '../../../../shared/pi-issue-chat-types'

export function upsertPiMessage(
  current: PiIssueChatMessage[],
  message: PiIssueChatMessage
): PiIssueChatMessage[] {
  if (!message.id) {
    return current.concat(message)
  }
  const index = current.findIndex((m) => m.id === message.id)
  if (index === -1) {
    return current.concat(message)
  }
  const next = current.slice()
  next[index] = message
  return next
}
