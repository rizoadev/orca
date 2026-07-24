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
  session: any // AgentSession from @earendil-works/pi-coding-agent
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

async function createPiSession(args: {
  cwd: string
  issueContext: string
  modelRef?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): Promise<{ session: any; modelId: string; provider: string }> {
  // Why: lazy import keeps Electron main startup fast when chat panel is not open.
  const { createAgentSession, AuthStorage, ModelRegistry, SessionManager } =
    await import('@earendil-works/pi-coding-agent')

  const authStorage = AuthStorage.create()
  const modelRegistry = ModelRegistry.create(authStorage)

  // Resolve model from modelRef if provided (matches ~/.pi/agent/models.json keys)
  let model: unknown
  if (args.modelRef) {
    const parts = args.modelRef.split('/')
    // modelRef format: "providerName/model/id" — last segment(s) are model id,
    // first is the pi provider name. Try exact registry lookup.
    if (parts.length >= 2) {
      const providerName = parts[0]
      const modelId = parts.slice(1).join('/')
      model = modelRegistry.find(providerName, modelId) ?? undefined
    }
  }

  // Fall back to first available model (has valid API key)
  if (!model) {
    const available = await modelRegistry.getAvailable()
    model = available[0] ?? undefined
  }

  const systemPrompt = [
    'You are a coding agent inside Orca issue chat.',
    'You can chat, call tools, edit files, and run shell commands in the project worktree.',
    `Project root (use absolute paths under this dir): ${args.cwd}`,
    `For bash tool, always cd to project root first: cd ${JSON.stringify(args.cwd)} && …`,
    'Prefer small, reviewable edits. Do not force-push or open PRs unless asked.',
    'Stay scoped to the issue context below.',
    '',
    '--- Issue context ---',
    args.issueContext.trim() || '(no description)'
  ].join('\n')

  const { session } = await createAgentSession({
    ...(model ? { model: model as never } : {}),
    // Why: in-memory session — issue chat is ephemeral, no disk persistence needed.
    sessionManager: SessionManager.inMemory(),
    authStorage,
    modelRegistry,
    systemPrompt,
    cwd: args.cwd,
    tools: ['read', 'bash', 'edit', 'write']
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolvedModel = (session as any).model
  const modelId: string = resolvedModel?.id ?? 'unknown'
  const provider: string = resolvedModel?.provider ?? 'pi'

  return { session, modelId, provider }
}

export async function startPiIssueChatSession(
  args: PiIssueChatStartArgs,
  emit: Emitter
): Promise<PiIssueChatSessionSnapshot> {
  const existing = sessions.get(args.sessionId)
  if (existing) {
    return snapshot(existing)
  }

  const { session, modelId, provider } = await createPiSession({
    cwd: args.cwd,
    issueContext: args.issueContext,
    modelRef: args.modelRef
  })

  const record: SessionRecord = {
    sessionId: args.sessionId,
    cwd: args.cwd,
    status: 'idle',
    messages: [],
    modelId,
    provider,
    session,
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
    record.session?.dispose?.()
  } catch {
    // ignore dispose errors on cleanup
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

  // Subscribe to pi SDK events for this turn
  const unsubscribe = record.session.subscribe(
    (event: {
      type: string
      assistantMessageEvent?: { type: string; delta?: string; name?: string }
    }) => {
      if (event.type !== 'message_update') {
        return
      }
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
    }
  )

  try {
    await record.session.prompt(trimmed)
    record.status = 'idle'
    emit({ type: 'status', sessionId, status: 'idle' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
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
