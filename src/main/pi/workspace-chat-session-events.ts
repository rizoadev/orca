import { randomUUID } from 'node:crypto'
import type { PiChatEvent, PiChatMessage } from '../../shared/pi-chat-types'
import { piLog } from './pi-session-factory'

export type WorkspaceChatEventRecord = {
  sessionId: string
  messages: PiChatMessage[]
  currentAssistantId: string | null
  currentAssistantContent: string
  currentAssistantEmitted: boolean
  agentSession: {
    subscribe: (listener: (event: WorkspaceChatSdkEvent) => void) => unknown
  }
}

type WorkspaceChatSdkEvent = {
  type: string
  assistantMessageEvent?: { type: string; delta?: string; name?: string }
  message?: { role: string; content: { type: string; text?: string }[] }
}

type EmitEvent = (event: PiChatEvent) => void

function message(role: PiChatMessage['role'], content: string, toolName?: string): PiChatMessage {
  return {
    id: randomUUID(),
    role,
    content,
    createdAt: Date.now(),
    ...(toolName ? { toolName } : {})
  }
}

/** Wire the permanent SDK event subscription once per workspace session. */
export function attachWorkspaceChatSdkSubscription(
  record: WorkspaceChatEventRecord,
  emitEvent: EmitEvent
): void {
  record.agentSession.subscribe((event) => {
    if (event.type === 'message_update') {
      const inner = event.assistantMessageEvent
      if (!inner) {
        return
      }
      if (inner.type === 'text_delta' && typeof inner.delta === 'string') {
        record.currentAssistantContent += inner.delta
        if (!record.currentAssistantEmitted && record.currentAssistantId) {
          const assistantMessage: PiChatMessage = {
            id: record.currentAssistantId,
            role: 'assistant',
            content: record.currentAssistantContent,
            createdAt: Date.now()
          }
          record.messages.push(assistantMessage)
          record.currentAssistantEmitted = true
          emitEvent({ type: 'message', sessionId: record.sessionId, message: assistantMessage })
        } else if (record.currentAssistantId) {
          const index = record.messages.findIndex((item) => item.id === record.currentAssistantId)
          if (index >= 0) {
            record.messages[index] = {
              ...record.messages[index]!,
              content: record.currentAssistantContent
            }
          }
          emitEvent({
            type: 'assistantDelta',
            sessionId: record.sessionId,
            messageId: record.currentAssistantId,
            delta: inner.delta
          })
        }
        return
      }
      if (inner.type === 'tool_start' && inner.name) {
        const toolMessage = message('tool', inner.name, inner.name)
        record.messages.push(toolMessage)
        emitEvent({
          type: 'tool',
          sessionId: record.sessionId,
          toolName: inner.name,
          messageId: toolMessage.id
        })
        emitEvent({ type: 'message', sessionId: record.sessionId, message: toolMessage })
      }
      return
    }

    // Some providers emit only message_end instead of text_delta.
    if (
      event.type === 'message_end' &&
      event.message?.role === 'assistant' &&
      !record.currentAssistantEmitted &&
      record.currentAssistantId
    ) {
      const text = event.message.content
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text ?? '')
        .join('')
      if (!text) {
        return
      }
      record.currentAssistantContent = text
      const assistantMessage: PiChatMessage = {
        id: record.currentAssistantId,
        role: 'assistant',
        content: text,
        createdAt: Date.now()
      }
      record.messages.push(assistantMessage)
      record.currentAssistantEmitted = true
      emitEvent({ type: 'message', sessionId: record.sessionId, message: assistantMessage })
    }
  })
}

export function emitWorkspaceChatEvent(
  record: { emitters: Set<EmitEvent> },
  event: PiChatEvent
): void {
  for (const emitter of record.emitters) {
    try {
      emitter(event)
    } catch (error) {
      piLog('workspace-chat emitter threw:', error)
    }
  }
}
