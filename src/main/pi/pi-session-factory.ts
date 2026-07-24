/**
 * Factory for creating a pi AgentSession for an issue chat panel.
 * Extracted to keep issue-chat-session.ts under the max-lines limit.
 */
import { mkdirSync, appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Directory where per-issue session JSONL files are stored. */
export const ISSUE_SESSIONS_DIR_DEFAULT = join(homedir(), '.pi', 'agent', 'sessions', 'orca-issues')

export function sessionFileSlug(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CreatePiSessionResult = { agentSession: any; modelId: string; provider: string; sessionFile: string | undefined }

const PI_CHAT_LOG = '/tmp/pi-chat-debug.log'

export function piLog(...args: unknown[]): void {
  const line = `[${new Date().toISOString()}] [pi-chat] ${args.map(String).join(' ')}\n`
  try {
    appendFileSync(PI_CHAT_LOG, line)
  } catch {
    /* ignore */
  }
}

export type SessionMode = 'continue' | 'new' | { type: 'open'; path: string }

export async function createPiSession(
  args: {
    cwd: string
    issueContext: string
    sessionId: string
    modelRef?: string
    sessionMode?: SessionMode
  },
  issueSessionsDir: string
): Promise<CreatePiSessionResult> {
  // Why: lazy import keeps Electron main startup fast when chat panel is not open.
  const {
    createAgentSession,
    AuthStorage,
    ModelRegistry,
    SessionManager,
    DefaultResourceLoader,
    getAgentDir
  } = await import('@earendil-works/pi-coding-agent')

  const agentDir = getAgentDir()
  piLog(
    'createPiSession start cwd=%s sessionId=%s modelRef=%s',
    args.cwd,
    args.sessionId,
    args.modelRef ?? 'none'
  )
  const authStorage = AuthStorage.create()
  const modelRegistry = ModelRegistry.create(authStorage)

  // Resolve model from modelRef if provided (matches ~/.pi/agent/models.json keys)
  let model: unknown
  if (args.modelRef) {
    const parts = args.modelRef.split('/')
    if (parts.length >= 2) {
      const providerName = parts[0]
      const modelId = parts.slice(1).join('/')
      model = modelRegistry.find(providerName, modelId) ?? undefined
    }
  }
  if (!model) {
    const available = await modelRegistry.getAvailable()
    // Why: prefer localhost models — they return real streaming content vs
    // some llmproxy routes that return empty content arrays.
    model = available.find((m) => m.provider === 'localhost') ?? available[0] ?? undefined
  }

  const systemPrompt = [
    'You are a coding agent inside Orca issue chat.',
    'You can chat, call tools, edit files, and run shell commands in the project worktree.',
    `Project root (use absolute paths under this dir): ${args.cwd}`,
    `For bash tool, always start with: cd ${JSON.stringify(args.cwd)} &&`,
    'Prefer small, reviewable edits. Do not force-push or open PRs unless asked.',
    'Stay scoped to the issue context below.',
    '',
    '--- Issue context ---',
    args.issueContext.trim() || '(no description)'
  ].join('\n')

  const loader = new DefaultResourceLoader({
    cwd: args.cwd,
    agentDir,
    systemPromptOverride: () => systemPrompt,
    appendSystemPromptOverride: () => []
  })
  await loader.reload()

  // Per-issue persistence: each issue gets its own session dir
  mkdirSync(issueSessionsDir, { recursive: true })
  const sessionDir = join(issueSessionsDir, sessionFileSlug(args.sessionId))
  mkdirSync(sessionDir, { recursive: true })

  const mode = args.sessionMode ?? 'continue'
  const sessionManager =
    mode === 'new'
      ? SessionManager.create(args.cwd, sessionDir)
      : typeof mode === 'object' && mode.type === 'open'
        ? SessionManager.open(mode.path)
        : SessionManager.continueRecent(args.cwd, sessionDir)

  const { session, modelFallbackMessage } = await createAgentSession({
    ...(model ? { model: model as never } : {}),
    resourceLoader: loader,
    sessionManager,
    authStorage,
    modelRegistry,
    tools: ['read', 'bash', 'edit', 'write']
  })

  if (modelFallbackMessage) {
    piLog('model fallback:', modelFallbackMessage)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolvedModel = (session as any).model
  const modelId: string = resolvedModel?.id ?? 'unknown'
  const provider: string = resolvedModel?.provider ?? 'pi'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionFile: string | undefined = (session as any).sessionFile
  piLog('session ready model=%s/%s file=%s', provider, modelId, sessionFile ?? 'none')

  return { agentSession: session, modelId, provider, sessionFile }
}
