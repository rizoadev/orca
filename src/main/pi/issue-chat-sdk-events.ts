/**
 * SDK event subscription for the in-process pi chat sessions. Translates the
 * Pi AgentSession event stream into PiIssueChatEvents: streaming text deltas
 * (with inline <thinking> splitting), native thinking deltas, tool starts, and
 * the non-streaming message_end fallback. Extracted from issue-chat-session to
 * keep that module focused on session lifecycle and within the max-lines budget.
 */
import { randomUUID } from 'node:crypto'
import type { PiIssueChatEvent, PiIssueChatMessage } from '../../shared/pi-issue-chat-types'
import { piLog } from './pi-session-factory'
import {
  applyAssistantFullText,
  applyAssistantTextStream,
  applyThinkingDelta,
  applyThinkingEnd,
  type AssistantTextStreamState
} from './pi-reasoning-stream'

/** Structural view of a session record the SDK handler needs. */
export type SdkEventTarget = AssistantTextStreamState & {
  sessionId: string
  messages: PiIssueChatMessage[]
  currentEmit: ((event: PiIssueChatEvent) => void) | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agentSession: any
}

type SdkEvent = {
  type: string
  assistantMessageEvent?: { type: string; delta?: string; name?: string; content?: string }
  message?: { role: string; content: { type: string; text?: string }[] }
}

function toolMsg(name: string): PiIssueChatMessage {
  return { id: randomUUID(), role: 'tool', content: name, createdAt: Date.now(), toolName: name }
}

function handleSdkEvent(target: SdkEventTarget, event: SdkEvent): void {
  const emit = target.currentEmit
  piLog(
    'sdk-event type=%s emit=%s assistantId=%s',
    event.type,
    emit ? 'yes' : 'NO',
    target.currentAssistantId ?? 'null'
  )
  if (!emit) {
    return
  }
  const { sessionId } = target

  if (event.type === 'message_update') {
    const inner = event.assistantMessageEvent
    if (!inner) {
      return
    }
    if (inner.type === 'text_delta' && typeof inner.delta === 'string') {
      // Why: local models embed <thinking>…</thinking> in the TEXT stream (no
      // native thinking_delta); split so reasoning grows above the clean reply.
      applyAssistantTextStream(target, target.messages, inner.delta, sessionId, emit)
      return
    }
    if (inner.type === 'tool_start' && inner.name) {
      const toolMessage = toolMsg(inner.name)
      target.messages.push(toolMessage)
      emit({ type: 'tool', sessionId, toolName: inner.name, messageId: toolMessage.id })
      emit({ type: 'message', sessionId, message: toolMessage })
    }
    if (inner.type === 'thinking_delta' && typeof inner.delta === 'string') {
      applyThinkingDelta(
        target,
        target.messages,
        inner.delta,
        sessionId,
        emit,
        target.currentAssistantId
      )
      return
    }
    if (inner.type === 'thinking_end' && typeof inner.content === 'string') {
      applyThinkingEnd(
        target,
        target.messages,
        inner.content,
        sessionId,
        emit,
        target.currentAssistantId
      )
      return
    }
    return
  }

  // Non-streaming fallback: some providers emit only message_end with content.
  if (
    event.type === 'message_end' &&
    event.message?.role === 'assistant' &&
    !target.currentAssistantEmitted &&
    target.currentAssistantId
  ) {
    const text = event.message.content
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text ?? '')
      .join('')
    if (!text) {
      return
    }
    applyAssistantFullText(target, target.messages, text, sessionId, emit)
  }
}

export function attachSdkSubscription(target: SdkEventTarget): void {
  target.agentSession.subscribe((event: SdkEvent) => handleSdkEvent(target, event))
}
