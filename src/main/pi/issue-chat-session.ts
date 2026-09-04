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
import { attachSdkSubscription } from './issue-chat-sdk-events'

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
  /** Set when the user force-stops the in-flight turn; send() treats the
   *  resulting prompt() resolution/rejection as a clean stop, not an error. */
  aborted: boolean
  /** Active emitter — set when panel attaches, cleared on detach. */
  currentEmit: Emitter | null
  currentAssistantId: string | null
  currentAssistantContent: string
  /** Full accumulated assistant text including any inline <thinking> markup. */
  currentAssistantRaw: string
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
    aborted: false,
    currentEmit: emit,
    currentAssistantId: null,
    currentAssistantContent: '',
    currentAssistantRaw: '',
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
  record.aborted = false
  record.currentAssistantId = randomUUID()
  record.currentAssistantContent = ''
  record.currentAssistantRaw = ''
  record.currentAssistantEmitted = false
  record.currentReasoningId = null
  record.currentReasoningContent = ''
  record.currentReasoningEmitted = false
  emit({ type: 'status', sessionId, status: 'running' })

  try {
    piLog('calling prompt', sessionId, trimmed.slice(0, 60))
    await record.agentSession.prompt(trimmed)
    finishTurn(record, sessionId, emit, { kind: 'idle' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    piLog('prompt ERROR', message)
    finishTurn(record, sessionId, emit, { kind: 'error', message })
  } finally {
    record.running = false
  }
}

/** Resolve a turn to idle or error. A user force-stop is a neutral 'Stopped.'
 *  note, never a red error — the user chose to stop. */
function finishTurn(
  record: SessionRecord,
  sessionId: string,
  emit: Emitter,
  outcome: { kind: 'idle' } | { kind: 'error'; message: string }
): void {
  record.currentAssistantId = null
  if (outcome.kind === 'error' && !record.aborted) {
    record.status = 'error'
    record.error = outcome.message
    const errMsg = msg('system', `Error: ${outcome.message}`)
    record.messages.push(errMsg)
    emit({ type: 'message', sessionId, message: errMsg })
    emit({ type: 'status', sessionId, status: 'error', error: outcome.message })
    return
  }
  record.status = 'idle'
  if (record.aborted) {
    const stopMsg = msg('system', 'Stopped.')
    record.messages.push(stopMsg)
    emit({ type: 'message', sessionId, message: stopMsg })
  }
  emit({ type: 'status', sessionId, status: 'idle' })
}

/** Force-stop the in-flight turn, keeping the session warm for a follow-up. */
export function abortPiIssueChatTurn(sessionId: string): void {
  const record = sessions.get(sessionId)
  if (!record || !record.running) {
    return
  }
  record.aborted = true
  void Promise.resolve(record.agentSession?.abort?.()).catch(() => {
    /* abort rejection is handled by send()'s aborted branch */
  })
}

export function clearAllPiIssueChatSessionsForTests(): void {
  for (const id of sessions.keys()) {
    stopPiIssueChatSession(id)
  }
}
