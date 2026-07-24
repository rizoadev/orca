/**
 * In-process Strands agent sessions for the issue-modal chat panel.
 * Why: terminal native-chat only understands Claude/Codex/Grok transcripts; Strands has none.
 */
import { randomUUID } from 'node:crypto'
import type {
  StrandsIssueChatEvent,
  StrandsIssueChatMessage,
  StrandsIssueChatSessionSnapshot,
  StrandsIssueChatStartArgs,
  StrandsIssueChatStatus
} from '../../shared/strands-issue-chat-types'
import {
  resolveStrandsApiKey,
  resolveStrandsModelId,
  resolveStrandsOpenAiBaseUrl,
  resolveStrandsProvider,
  type StrandsProvider
} from '../../shared/strands-model-config'
import { ensureStrandsEnvLoaded } from '../../shared/strands-env-load'

type StreamEvent = {
  type?: string
  event?: { type?: string; delta?: { type?: string; text?: string } }
  toolUse?: { name?: string }
}

type StrandsAgent = {
  stream: (prompt: string) => AsyncIterable<StreamEvent>
}

type SessionRecord = {
  sessionId: string
  cwd: string
  status: StrandsIssueChatStatus
  messages: StrandsIssueChatMessage[]
  error?: string
  provider: string
  modelId: string
  agent: StrandsAgent
  running: boolean
  abort: AbortController | null
}

const sessions = new Map<string, SessionRecord>()

type Emitter = (event: StrandsIssueChatEvent) => void

function msg(
  role: StrandsIssueChatMessage['role'],
  content: string,
  toolName?: string
): StrandsIssueChatMessage {
  return {
    id: randomUUID(),
    role,
    content,
    createdAt: Date.now(),
    ...(toolName ? { toolName } : {})
  }
}

function snapshot(record: SessionRecord): StrandsIssueChatSessionSnapshot {
  return {
    sessionId: record.sessionId,
    status: record.status,
    messages: record.messages,
    ...(record.error ? { error: record.error } : {}),
    provider: record.provider,
    modelId: record.modelId,
    cwd: record.cwd
  }
}

async function createAgent(args: {
  cwd: string
  issueContext: string
  provider: StrandsProvider
  modelId: string
  /** Merged env (strandsEnv + process.env) forwarded from startStrandsIssueChatSession. */
  resolvedEnv: NodeJS.ProcessEnv
}): Promise<StrandsAgent> {
  ensureStrandsEnvLoaded()
  // Why: Strands is ESM-friendly; keep load lazy so main startup stays light without the panel.
  const { Agent } = await import('@strands-agents/sdk')
  const { fileEditor } = await import('@strands-agents/sdk/vended-tools/file-editor')
  const { bash } = await import('@strands-agents/sdk/vended-tools/bash')
  const { httpRequest } = await import('@strands-agents/sdk/vended-tools/http-request')
  const { notebook } = await import('@strands-agents/sdk/vended-tools/notebook')

  let model: unknown
  if (args.provider === 'anthropic') {
    const { AnthropicModel } = await import('@strands-agents/sdk/models/anthropic')
    model = new AnthropicModel({
      apiKey: resolveStrandsApiKey('anthropic', args.resolvedEnv),
      modelId: args.modelId,
      maxTokens: 16_384
    })
  } else if (args.provider === 'openai') {
    const { OpenAIModel } = await import('@strands-agents/sdk/models/openai')
    model = new OpenAIModel({
      api: 'chat',
      apiKey: resolveStrandsApiKey('openai', args.resolvedEnv),
      modelId: args.modelId,
      maxTokens: 16_384,
      clientConfig: {
        baseURL: resolveStrandsOpenAiBaseUrl(args.resolvedEnv)
      }
    })
  }

  const systemPrompt = [
    'You are Strands, a coding agent inside Orca issue chat.',
    'You can chat, call tools, edit files, and run shell commands in the project worktree.',
    `Project root (use absolute paths under this dir): ${args.cwd}`,
    `For bash, always start with: cd ${JSON.stringify(args.cwd)} && …`,
    'Prefer small, reviewable edits. Do not force-push or open PRs unless asked.',
    'Stay scoped to the issue context below.',
    '',
    '--- Issue context ---',
    args.issueContext.trim() || '(no description)'
  ].join('\n')

  // Why: never chdir the Electron main process — multi-window/tools share one process.

  return new Agent({
    ...(model ? { model: model as never } : { model: args.modelId }),
    tools: [fileEditor, bash, httpRequest, notebook],
    systemPrompt,
    printer: false
  }) as unknown as StrandsAgent
}

function extractDelta(event: StreamEvent): string {
  if (event.type !== 'modelStreamUpdateEvent') {
    return ''
  }
  const inner = event.event
  if (!inner || inner.type !== 'modelContentBlockDeltaEvent') {
    return ''
  }
  const delta = inner.delta
  if (delta?.type === 'textDelta' && typeof delta.text === 'string') {
    return delta.text
  }
  return ''
}

export async function startStrandsIssueChatSession(
  args: StrandsIssueChatStartArgs,
  emit: Emitter
): Promise<StrandsIssueChatSessionSnapshot> {
  const existing = sessions.get(args.sessionId)
  if (existing) {
    return snapshot(existing)
  }

  ensureStrandsEnvLoaded()
  // Why: renderer forwards agentDefaultEnv.strands so in-process sessions honour
  // the same model config the user set for terminal `orca strands` launches.
  // Only fill gaps — explicit args.provider/modelId and existing env vars win.
  const mergedEnv = args.strandsEnv ? { ...args.strandsEnv, ...process.env } : process.env
  const provider = resolveStrandsProvider(args.provider, mergedEnv)
  const modelId = resolveStrandsModelId(provider, args.modelId, mergedEnv)
  const agent = await createAgent({
    cwd: args.cwd,
    issueContext: args.issueContext,
    provider,
    modelId,
    resolvedEnv: mergedEnv
  })

  const record: SessionRecord = {
    sessionId: args.sessionId,
    cwd: args.cwd,
    status: 'idle',
    messages: [],
    provider,
    modelId,
    agent,
    running: false,
    abort: null
  }
  sessions.set(args.sessionId, record)
  const snap = snapshot(record)
  emit({ type: 'snapshot', session: snap })
  return snap
}

export function getStrandsIssueChatSession(
  sessionId: string
): StrandsIssueChatSessionSnapshot | null {
  const record = sessions.get(sessionId)
  return record ? snapshot(record) : null
}

export function stopStrandsIssueChatSession(sessionId: string): void {
  const record = sessions.get(sessionId)
  if (!record) {
    return
  }
  record.abort?.abort()
  record.running = false
  record.status = 'idle'
  sessions.delete(sessionId)
}

export async function sendStrandsIssueChatMessage(
  sessionId: string,
  text: string,
  emit: Emitter
): Promise<void> {
  const record = sessions.get(sessionId)
  if (!record) {
    throw new Error('Strands issue chat session not found. Open the chat panel again.')
  }
  const trimmed = text.trim()
  if (!trimmed) {
    return
  }
  if (record.running) {
    throw new Error('Strands is still responding. Wait for the current turn to finish.')
  }

  const userMessage = msg('user', trimmed)
  record.messages.push(userMessage)
  emit({ type: 'message', sessionId, message: userMessage })

  record.running = true
  record.status = 'running'
  record.error = undefined
  record.abort = new AbortController()
  emit({ type: 'status', sessionId, status: 'running' })

  const assistantId = randomUUID()
  let assistantContent = ''
  let assistantEmitted = false

  try {
    for await (const event of record.agent.stream(trimmed)) {
      if (record.abort?.signal.aborted) {
        break
      }
      const toolName = event.type === 'beforeToolCallEvent' ? event.toolUse?.name : undefined
      if (toolName) {
        const toolMessage = msg('tool', toolName, toolName)
        record.messages.push(toolMessage)
        emit({ type: 'tool', sessionId, toolName, messageId: toolMessage.id })
        emit({ type: 'message', sessionId, message: toolMessage })
        continue
      }
      const delta = extractDelta(event)
      if (delta) {
        assistantContent += delta
        if (!assistantEmitted) {
          const message: StrandsIssueChatMessage = {
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
            record.messages[idx] = {
              ...record.messages[idx]!,
              content: assistantContent
            }
          }
          emit({
            type: 'assistantDelta',
            sessionId,
            messageId: assistantId,
            delta
          })
        }
      }
    }
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
    record.abort = null
  }
}

export function clearAllStrandsIssueChatSessionsForTests(): void {
  for (const id of sessions.keys()) {
    stopStrandsIssueChatSession(id)
  }
}
