/**
 * In-process pi AgentSession sessions for the issue-modal chat panel.
 * Sessions are KEPT ALIVE on panel unmount (soft-detach) to preserve
 * history + model when switching modal ↔ window mode.
 */
import { randomUUID } from 'node:crypto'
import type {
  PiIssueChatEvent,
  PiIssueChatMessage,
  PiIssueChatSessionSnapshot,
  PiIssueChatStartArgs,
  PiIssueChatStatus
} from '../../shared/pi-issue-chat-types'
import { createPiSession, ISSUE_SESSIONS_DIR_DEFAULT, piLog } from './pi-session-factory'
import { applyThinkingDelta, applyThinkingEnd } from './pi-reasoning-stream'

type Emitter = (event: PiIssueChatEvent) => void

type SessionRecord = {
  sessionId: string
  cwd: string
  status: PiIssueChatStatus
  messages: PiIssueChatMessage[]
  error?: string
  modelId: string
  provider: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agentSession: any
  running: boolean
  /** Active emitter — set when panel attaches, cleared on detach. */
  currentEmit: Emitter | null
  currentAssistantId: string | null
  currentAssistantContent: string
  currentAssistantEmitted: boolean
  /** Streaming reasoning (thinking) state — mirrors the assistant fields. */
  currentReasoningId: string | null
  currentReasoningContent: string
  currentReasoningEmitted: boolean
  /** Path to the active session JSONL file (for history UI). */
  sessionFile: string | undefined
  /** Stored issue context for session reconstruction (new/switch). */
  issueContext: string
}

const sessions = new Map<string, SessionRecord>()

export function getSessionsMap(): Map<string, SessionRecord> {
  return sessions
}

function msg(
  role: PiIssueChatMessage['role'],
  content: string,
  toolName?: string
): PiIssueChatMessage {
  return {
    id: randomUUID(),
    role,
    content,
    createdAt: Date.now(),
    ...(toolName ? { toolName } : {})
  }
}

function snapshot(record: SessionRecord): PiIssueChatSessionSnapshot {
  return {
    sessionId: record.sessionId,
    status: record.status,
    messages: record.messages,
    ...(record.error ? { error: record.error } : {}),
    modelId: record.modelId,
    provider: record.provider,
    cwd: record.cwd
  }
}

/** Wire permanent SDK event subscription on a new record. */
function attachSdkSubscription(record: SessionRecord): void {
  record.agentSession.subscribe(
    (event: {
      type: string
      assistantMessageEvent?: { type: string; delta?: string; name?: string; content?: string }
      message?: { role: string; content: { type: string; text?: string }[] }
    }) => {
      const emit = record.currentEmit
      piLog(
        'sdk-event type=%s emit=%s assistantId=%s',
        event.type,
        emit ? 'yes' : 'NO',
        record.currentAssistantId ?? 'null'
      )
      if (!emit) {
        return
      }
      const { sessionId } = record

      // ── streaming: text_delta ───────────────────────────────────────────────
      if (event.type === 'message_update') {
        const inner = event.assistantMessageEvent
        if (!inner) {
          return
        }

        if (inner.type === 'text_delta' && typeof inner.delta === 'string') {
          record.currentAssistantContent += inner.delta
          if (!record.currentAssistantEmitted && record.currentAssistantId) {
            const message: PiIssueChatMessage = {
              id: record.currentAssistantId,
              role: 'assistant',
              content: record.currentAssistantContent,
              createdAt: Date.now()
            }
            record.messages.push(message)
            record.currentAssistantEmitted = true
            emit({ type: 'message', sessionId, message })
          } else if (record.currentAssistantId) {
            const idx = record.messages.findIndex((m) => m.id === record.currentAssistantId)
            if (idx >= 0) {
              record.messages[idx] = {
                ...record.messages[idx]!,
                content: record.currentAssistantContent
              }
            }
            emit({
              type: 'assistantDelta',
              sessionId,
              messageId: record.currentAssistantId,
              delta: inner.delta
            })
          }
          return
        }
        if (inner.type === 'tool_start' && inner.name) {
          const toolMessage = msg('tool', inner.name, inner.name)
          record.messages.push(toolMessage)
          emit({ type: 'tool', sessionId, toolName: inner.name, messageId: toolMessage.id })
          emit({ type: 'message', sessionId, message: toolMessage })
        }
        // ── streaming: thinking (reasoning) ───────────────────────────────────
        // Why: providers with extended thinking emit thinking_delta before the
        // visible reply. Surface it as a separate 'reasoning' message so the
        // chatbox renders a live thinking-aside (spoiler) that grows in
        // realtime, then collapses once the assistant answer lands.
        if (inner.type === 'thinking_delta' && typeof inner.delta === 'string') {
          applyThinkingDelta(record, record.messages, inner.delta, sessionId, emit)
          return
        }
        if (inner.type === 'thinking_end' && typeof inner.content === 'string') {
          applyThinkingEnd(record, record.messages, inner.content, sessionId, emit)
          return
        }
        return
      }

      // Non-streaming fallback: message_end with full content
      // Why: some providers don't emit text_delta, only message_end.
      if (
        event.type === 'message_end' &&
        event.message?.role === 'assistant' &&
        !record.currentAssistantEmitted &&
        record.currentAssistantId
      ) {
        const text = event.message.content
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text ?? '')
          .join('')
        if (!text) {
          return
        }
        record.currentAssistantContent = text
        const message: PiIssueChatMessage = {
          id: record.currentAssistantId,
          role: 'assistant',
          content: text,
          createdAt: Date.now()
        }
        record.messages.push(message)
        record.currentAssistantEmitted = true
        emit({ type: 'message', sessionId, message })
      }
    }
  )
}

export async function startPiIssueChatSession(
  args: PiIssueChatStartArgs,
  emit: Emitter
): Promise<PiIssueChatSessionSnapshot> {
  const existing = sessions.get(args.sessionId)
  if (existing) {
    piLog(
      're-attach warm session',
      args.sessionId,
      'model=%s/%s',
      existing.provider,
      existing.modelId
    )
    existing.currentEmit = emit
    const snap = snapshot(existing)
    emit({ type: 'snapshot', session: snap })
    return snap
  }

  const { agentSession, modelId, provider, sessionFile } = await createPiSession(
    {
      cwd: args.cwd,
      issueContext: args.issueContext,
      sessionId: args.sessionId,
      modelRef: args.modelRef,
      sessionMode: args.sessionMode
    },
    ISSUE_SESSIONS_DIR_DEFAULT
  )

  // Replay persisted messages from resumed session file
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const persistedMessages: PiIssueChatMessage[] = ((agentSession as any).messages ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .flatMap((m: any) => {
      const role: PiIssueChatMessage['role'] =
        m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = m.blocks?.find((b: any) => b.type === 'text')?.text ?? ''
      if (!text) {
        return []
      }
      return [msg(role, text)]
    })

  const record: SessionRecord = {
    sessionId: args.sessionId,
    cwd: args.cwd,
    status: 'idle',
    messages: persistedMessages,
    modelId,
    provider,
    agentSession,
    running: false,
    currentEmit: emit,
    currentAssistantId: null,
    currentAssistantContent: '',
    currentAssistantEmitted: false,
    currentReasoningId: null,
    currentReasoningContent: '',
    currentReasoningEmitted: false,
    sessionFile,
    issueContext: args.issueContext
  }
  attachSdkSubscription(record)
  sessions.set(args.sessionId, record)
  const snap = snapshot(record)
  emit({ type: 'snapshot', session: snap })
  return snap
}

export function getPiIssueChatSession(sessionId: string): PiIssueChatSessionSnapshot | null {
  const record = sessions.get(sessionId)
  return record ? snapshot(record) : null
}

/** Soft-detach: clear emit so events stop. Session stays warm. */
export function detachPiIssueChatSession(sessionId: string): void {
  const record = sessions.get(sessionId)
  if (!record) {
    return
  }
  record.currentEmit = null
}

/** Hard stop: dispose session and remove from Map. */
export function stopPiIssueChatSession(sessionId: string): void {
  const record = sessions.get(sessionId)
  if (!record) {
    return
  }
  record.currentEmit = null
  try {
    record.agentSession?.dispose?.()
  } catch {
    // ignore dispose errors
  }
  sessions.delete(sessionId)
}

export async function sendPiIssueChatMessage(
  sessionId: string,
  text: string,
  emit: Emitter
): Promise<void> {
  const record = sessions.get(sessionId)
  if (!record) {
    throw new Error('Pi issue chat session not found. Open the chat panel again.')
  }
  const trimmed = text.trim()
  if (!trimmed) {
    return
  }
  if (record.running) {
    throw new Error('Pi agent is still responding. Wait for the current turn to finish.')
  }

  record.currentEmit = emit // re-attach in case panel re-mounted
  const userMessage = msg('user', trimmed)
  record.messages.push(userMessage)
  emit({ type: 'message', sessionId, message: userMessage })
  record.running = true
  record.status = 'running'
  record.error = undefined
  record.currentAssistantId = randomUUID()
  record.currentAssistantContent = ''
  record.currentAssistantEmitted = false
  record.currentReasoningId = null
  record.currentReasoningContent = ''
  record.currentReasoningEmitted = false
  emit({ type: 'status', sessionId, status: 'running' })

  try {
    piLog('calling prompt', sessionId, trimmed.slice(0, 60))
    await record.agentSession.prompt(trimmed)
    piLog(
      'prompt done emitted=%s content=%s',
      record.currentAssistantEmitted,
      record.currentAssistantContent.slice(0, 80)
    )
    record.status = 'idle'
    record.currentAssistantId = null
    emit({ type: 'status', sessionId, status: 'idle' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    piLog('prompt ERROR', message)
    record.status = 'error'
    record.error = message
    record.currentAssistantId = null
    const errMsg = msg('system', `Error: ${message}`)
    record.messages.push(errMsg)
    emit({ type: 'message', sessionId, message: errMsg })
    emit({ type: 'status', sessionId, status: 'error', error: message })
  } finally {
    record.running = false
  }
}

export function clearAllPiIssueChatSessionsForTests(): void {
  for (const id of sessions.keys()) {
    stopPiIssueChatSession(id)
  }
}
