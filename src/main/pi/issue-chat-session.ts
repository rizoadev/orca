/**
 * In-process pi AgentSession sessions for the issue-modal chat panel.
 * Why: replaces Strands with pi SDK so all models from ~/.pi/agent/models.json
 * are available and the full pi tool suite (read, bash, edit, write) is active.
 */
import { randomUUID } from 'node:crypto'
import type {
  PiIssueChatEvent,
  PiIssueChatMessage,
  PiIssueChatSessionSnapshot,
  PiIssueChatStartArgs,
  PiIssueChatStatus
} from '../../shared/pi-issue-chat-types'
import { createPiSession, ISSUE_SESSIONS_DIR_DEFAULT } from './pi-session-factory'

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
  agentSession: any // AgentSession from @earendil-works/pi-coding-agent
  running: boolean
}

const sessions = new Map<string, SessionRecord>()

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

export async function startPiIssueChatSession(
  args: PiIssueChatStartArgs,
  emit: Emitter
): Promise<PiIssueChatSessionSnapshot> {
  const existing = sessions.get(args.sessionId)
  if (existing) {
    return snapshot(existing)
  }

  const { agentSession, modelId, provider } = await createPiSession(
    {
      cwd: args.cwd,
      issueContext: args.issueContext,
      sessionId: args.sessionId,
      modelRef: args.modelRef
    },
    ISSUE_SESSIONS_DIR_DEFAULT
  )

  // Replay persisted messages from the resumed session so the UI shows history
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
    running: false
  }

  sessions.set(args.sessionId, record)
  const snap = snapshot(record)
  emit({ type: 'snapshot', session: snap })
  return snap
}

export function getPiIssueChatSession(sessionId: string): PiIssueChatSessionSnapshot | null {
  const record = sessions.get(sessionId)
  return record ? snapshot(record) : null
}

export function stopPiIssueChatSession(sessionId: string): void {
  const record = sessions.get(sessionId)
  if (!record) {
    return
  }
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

  const userMessage = msg('user', trimmed)
  record.messages.push(userMessage)
  emit({ type: 'message', sessionId, message: userMessage })

  record.running = true
  record.status = 'running'
  record.error = undefined
  emit({ type: 'status', sessionId, status: 'running' })

  const assistantId = randomUUID()
  let assistantContent = ''
  let assistantEmitted = false

  // Subscribe to pi SDK events for this turn.
  // Why: handle both streaming (text_delta) and non-streaming (message_end)
  // models — some providers emit text_delta, others only emit message_end.
  const unsubscribe = record.agentSession.subscribe(
    (event: {
      type: string
      assistantMessageEvent?: { type: string; delta?: string; name?: string }
      message?: { role: string; content: { type: string; text?: string; name?: string }[] }
    }) => {
      // ── streaming path: text_delta events ──────────────────────────────────
      if (event.type === 'message_update') {
        const inner = event.assistantMessageEvent
        if (!inner) {
          return
        }

        if (inner.type === 'text_delta' && typeof inner.delta === 'string') {
          assistantContent += inner.delta
          if (!assistantEmitted) {
            const message: PiIssueChatMessage = {
              id: assistantId,
              role: 'assistant',
              content: assistantContent,
              createdAt: Date.now()
            }
            record.messages.push(message)
            assistantEmitted = true
            emit({ type: 'message', sessionId, message })
          } else {
            const idx = record.messages.findIndex((m) => m.id === assistantId)
            if (idx >= 0) {
              record.messages[idx] = { ...record.messages[idx]!, content: assistantContent }
            }
            emit({ type: 'assistantDelta', sessionId, messageId: assistantId, delta: inner.delta })
          }
          return
        }

        // Tool call start
        if (inner.type === 'tool_start' && inner.name) {
          const toolMessage = msg('tool', inner.name, inner.name)
          record.messages.push(toolMessage)
          emit({ type: 'tool', sessionId, toolName: inner.name, messageId: toolMessage.id })
          emit({ type: 'message', sessionId, message: toolMessage })
        }
        return
      }

      // ── non-streaming fallback: message_end with full content ───────────────
      // Why: some providers don't emit text_delta — only message_end with the
      // complete content array. Capture full text here if no deltas arrived.
      if (
        event.type === 'message_end' &&
        event.message?.role === 'assistant' &&
        !assistantEmitted
      ) {
        const text = event.message.content
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text ?? '')
          .join('')
        if (!text) {
          return
        }
        assistantContent = text
        const message: PiIssueChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: text,
          createdAt: Date.now()
        }
        record.messages.push(message)
        assistantEmitted = true
        emit({ type: 'message', sessionId, message })
      }
    }
  )

  try {
    console.log('[pi-chat] calling prompt...')
    await record.agentSession.prompt(trimmed)
    console.log(
      '[pi-chat] prompt done, assistantEmitted=%s content=%s',
      assistantEmitted,
      assistantContent.slice(0, 80)
    )
    record.status = 'idle'
    emit({ type: 'status', sessionId, status: 'idle' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[pi-chat] prompt ERROR:', message)
    record.status = 'error'
    record.error = message
    const errMsg = msg('system', `Error: ${message}`)
    record.messages.push(errMsg)
    emit({ type: 'message', sessionId, message: errMsg })
    emit({ type: 'status', sessionId, status: 'error', error: message })
  } finally {
    record.running = false
    unsubscribe()
  }
}

export function clearAllPiIssueChatSessionsForTests(): void {
  for (const id of sessions.keys()) {
    stopPiIssueChatSession(id)
  }
}
