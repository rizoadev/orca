/**
 * In-process Pi AgentSession engine for workspace-scoped chat (mobile + web).
 * Like the issue chat, sessions stay warm while subscribers detach; unlike it,
 * each session fans events out to a Set of emitters so multiple clients (a
 * mobile phone plus the desktop panel) can watch one conversation.
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type {
  PiChatEvent,
  PiChatMessage,
  PiChatSessionSnapshot,
  PiChatStartArgs,
  PiChatStatus,
  PiSessionInfo
} from '../../shared/pi-chat-types'
import { createPiSession, piLog } from './pi-session-factory'
import {
  attachWorkspaceChatSdkSubscription,
  emitWorkspaceChatEvent
} from './workspace-chat-session-events'
import { listPiModels, setPiSessionModel } from './pi-model-registry'
import { listPiIssueSessions, deletePiIssueSession } from './pi-session-manager'

export const WORKSPACE_SESSIONS_DIR = join(homedir(), '.pi', 'agent', 'sessions', 'orca-workspaces')

export type PiChatEmitter = (event: PiChatEvent) => void

export type PiWorktreePathResolver = (worktreeId: string) => Promise<string>

type SessionRecord = {
  sessionId: string
  worktreeId: string
  cwd: string
  status: PiChatStatus
  messages: PiChatMessage[]
  error?: string
  modelId: string
  provider: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  agentSession: any
  running: boolean
  /** Every live subscriber (RPC stream / desktop panel) receives each event. */
  emitters: Set<PiChatEmitter>
  currentAssistantId: string | null
  currentAssistantContent: string
  currentAssistantEmitted: boolean
  sessionFile: string | undefined
  abort: AbortController | null
}

const sessions = new Map<string, SessionRecord>()

export function getSessionsMapForTests(): Map<string, SessionRecord> {
  return sessions
}

function msg(role: PiChatMessage['role'], content: string, toolName?: string): PiChatMessage {
  return {
    id: randomUUID(),
    role,
    content,
    createdAt: Date.now(),
    ...(toolName ? { toolName } : {})
  }
}

function snapshot(record: SessionRecord): PiChatSessionSnapshot {
  return {
    sessionId: record.sessionId,
    worktreeId: record.worktreeId,
    status: record.status,
    messages: record.messages,
    ...(record.error ? { error: record.error } : {}),
    modelId: record.modelId,
    provider: record.provider,
    cwd: record.cwd
  }
}

function emit(record: SessionRecord, event: PiChatEvent): void {
  emitWorkspaceChatEvent(record, event)
}

function defaultSystemPrompt(cwd: string): string {
  return [
    'You are a coding assistant for this workspace.',
    'You can chat, call tools, edit files, and run shell commands in the project worktree.',
    `Project root (use absolute paths under this dir): ${cwd}`,
    `For bash tool, always start with: cd ${JSON.stringify(cwd)} &&`,
    'Prefer small, reviewable edits. Do not force-push or open PRs unless asked.',
    'Stay scoped to the conversation.'
  ].join('\n')
}

async function startOrResumeRecord(
  args: PiChatStartArgs,
  resolveWorktreePath: PiWorktreePathResolver,
  sessionDir: string
): Promise<SessionRecord> {
  const existing = sessions.get(args.sessionId)
  // Why: `new` and `{ type: 'open' }` both target a different conversation file
  // than the warm one, so both must force a fresh create (stop + re-start).
  const forcesFresh = args.sessionMode === 'new' || args.sessionMode?.type === 'open'
  if (existing && !forcesFresh) {
    return existing
  }
  if (existing) {
    stopSession(args.sessionId)
  }
  const cwd = await resolveWorktreePath(args.worktreeId)
  const { agentSession, modelId, provider, sessionFile } = await createPiSession(
    {
      cwd,
      issueContext: args.systemPrompt ?? defaultSystemPrompt(cwd),
      sessionId: args.sessionId,
      modelRef: args.modelRef,
      sessionMode: args.sessionMode ?? 'continue'
    },
    sessionDir
  )

  // Replay persisted messages from the resumed session file.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const persistedMessages: PiChatMessage[] = ((agentSession as any).messages ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .flatMap((m: any) => {
      const role: PiChatMessage['role'] =
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
    worktreeId: args.worktreeId,
    cwd,
    status: 'idle',
    messages: persistedMessages,
    modelId,
    provider,
    agentSession,
    running: false,
    emitters: new Set(),
    currentAssistantId: null,
    currentAssistantContent: '',
    currentAssistantEmitted: false,
    sessionFile,
    abort: null
  }
  attachWorkspaceChatSdkSubscription(record, emit.bind(null, record))
  sessions.set(args.sessionId, record)
  return record
}

/**
 * Ensure a warm session exists for a worktree and attach a subscriber. Returns
 * the snapshot plus an unsubscribe function that detaches this emitter; the
 * session stays warm until `stopSession` is called (or the last emitter
 * detaches with `stopWhenIdle`).
 */
export async function subscribeToPiChat(
  args: PiChatStartArgs,
  resolveWorktreePath: PiWorktreePathResolver,
  emitter: PiChatEmitter,
  options: { sessionDir?: string; stopWhenIdle?: boolean } = {}
): Promise<{ snapshot: PiChatSessionSnapshot; unsubscribe: () => void }> {
  const sessionDir = options.sessionDir ?? WORKSPACE_SESSIONS_DIR
  const record = await startOrResumeRecord(args, resolveWorktreePath, sessionDir)
  record.emitters.add(emitter)
  emit(record, { type: 'snapshot', session: snapshot(record) })
  let detached = false
  const unsubscribe = (): void => {
    if (detached) {
      return
    }
    detached = true
    record.emitters.delete(emitter)
    if (options.stopWhenIdle && record.emitters.size === 0 && !record.running) {
      stopSession(record.sessionId)
    }
  }
  return { snapshot: snapshot(record), unsubscribe }
}

export async function getPiChatSession(sessionId: string): Promise<PiChatSessionSnapshot | null> {
  const record = sessions.get(sessionId)
  return record ? snapshot(record) : null
}

export async function sendPiChatMessage(
  sessionId: string,
  worktreeId: string,
  text: string,
  resolveWorktreePath: PiWorktreePathResolver,
  options: { sessionDir?: string } = {}
): Promise<PiChatSessionSnapshot> {
  const sessionDir = options.sessionDir ?? WORKSPACE_SESSIONS_DIR
  const existing = sessions.get(sessionId)
  const record =
    existing ??
    (await startOrResumeRecord(
      {
        sessionId,
        worktreeId,
        systemPrompt: undefined,
        sessionMode: 'continue'
      },
      resolveWorktreePath,
      sessionDir
    ))

  const trimmed = text.trim()
  if (!trimmed) {
    return snapshot(record)
  }
  if (record.running) {
    throw new Error('Pi is still responding. Wait for the current turn to finish.')
  }

  const userMessage = msg('user', trimmed)
  record.messages.push(userMessage)
  emit(record, { type: 'message', sessionId, message: userMessage })
  record.running = true
  record.status = 'running'
  record.error = undefined
  record.currentAssistantId = randomUUID()
  record.currentAssistantContent = ''
  record.currentAssistantEmitted = false
  record.abort = new AbortController()
  emit(record, { type: 'status', sessionId, status: 'running' })

  try {
    piLog('workspace-chat prompt', sessionId, trimmed.slice(0, 60))
    await record.agentSession.prompt(trimmed)
    record.status = 'idle'
    record.currentAssistantId = null
    emit(record, { type: 'status', sessionId, status: 'idle' })
  } catch (error) {
    if (record.abort?.signal.aborted) {
      record.status = 'idle'
      record.currentAssistantId = null
      emit(record, { type: 'status', sessionId, status: 'idle' })
    } else {
      const message = error instanceof Error ? error.message : String(error)
      piLog('workspace-chat prompt ERROR', message)
      record.status = 'error'
      record.error = message
      record.currentAssistantId = null
      const errMsg = msg('system', `Error: ${message}`)
      record.messages.push(errMsg)
      emit(record, { type: 'message', sessionId, message: errMsg })
      emit(record, { type: 'status', sessionId, status: 'error', error: message })
    }
  } finally {
    record.running = false
    record.abort = null
  }
  return snapshot(record)
}

export async function stopPiChatSession(sessionId: string): Promise<void> {
  const record = sessions.get(sessionId)
  if (!record) {
    return
  }
  if (record.abort) {
    record.abort.abort()
  }
  // Why: stop() is a hard teardown; the in-flight prompt promise settles via
  // its abort signal and the finally block clears running.
  stopSession(sessionId)
}

export function detachPiChatSubscriber(sessionId: string, emitter: PiChatEmitter): void {
  const record = sessions.get(sessionId)
  record?.emitters.delete(emitter)
}

export function stopSession(sessionId: string): void {
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

export function listPiChatModels(): ReturnType<typeof listPiModels> {
  return listPiModels()
}

export async function setPiChatModel(sessionId: string, modelRef: string): Promise<string> {
  const record = sessions.get(sessionId)
  if (!record) {
    throw new Error('Session not found')
  }
  const label = await setPiSessionModel(sessions as never, sessionId, modelRef)
  const [provider, modelId] = label.split('/')
  record.provider = provider ?? record.provider
  record.modelId = modelId ?? record.modelId
  return label
}

export async function listPiChatSessions(
  sessionId: string,
  worktreeId: string,
  resolveWorktreePath: PiWorktreePathResolver
): Promise<PiSessionInfo[]> {
  const cwd = await resolveWorktreePath(worktreeId)
  const active = sessions.get(sessionId)?.sessionFile
  return listPiIssueSessions(cwd, sessionId, active)
}

export async function deletePiChatSession(sessionId: string, sessionPath: string): Promise<void> {
  deletePiIssueSession(sessionPath)
  const record = sessions.get(sessionId)
  if (record?.sessionFile === sessionPath) {
    stopSession(sessionId)
  }
}

export function clearAllPiChatSessionsForTests(): void {
  for (const id of sessions.keys()) {
    stopSession(id)
  }
}
