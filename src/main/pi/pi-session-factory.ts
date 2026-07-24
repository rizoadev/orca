/**
 * Factory for creating a pi AgentSession for an issue chat panel.
 * Extracted to keep issue-chat-session.ts under the max-lines limit.
 */
import { mkdirSync, appendFileSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Directory where per-issue session JSONL files are stored. */
export const ISSUE_SESSIONS_DIR_DEFAULT = join(homedir(), '.pi', 'agent', 'sessions', 'orca-issues')

export function sessionFileSlug(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CreatePiSessionResult = { agentSession: any; modelId: string; provider: string; sessionFile: string | undefined }

const PI_CHAT_LOG = '/tmp/pi-chat-debug.log'

/**
 * Import pi SDK — tries standard import first (dev), falls back to
 * scanning ~/.local/share/pi-node/ for the installed SDK (packaged app).
 */
async function importPiSdk(): Promise<typeof import('@earendil-works/pi-coding-agent')> {
  try {
    return await import('@earendil-works/pi-coding-agent')
  } catch {
    // Packaged app: scan pi-node installation dirs for the SDK
    const candidates: string[] = []
    const piNodeBase = join(homedir(), '.local', 'share', 'pi-node')
    try {
      for (const v of readdirSync(piNodeBase)) {
        candidates.push(join(piNodeBase, v, 'lib', 'node_modules', '@earendil-works', 'pi-coding-agent'))
      }
    } catch { /* ignore */ }
    // Also try finding from `which pi` binary location
    try {
      const { execSync } = await import('node:child_process')
      const piBin = execSync('which pi 2>/dev/null || echo ""', { encoding: 'utf8' }).trim()
      if (piBin) {
        candidates.push(join(dirname(dirname(piBin)), 'lib', 'node_modules', '@earendil-works', 'pi-coding-agent'))
      }
    } catch { /* ignore */ }
    for (const sdkPath of candidates) {
      if (existsSync(join(sdkPath, 'package.json'))) {
        piLog('importing pi SDK from fallback path:', sdkPath)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return import(pathToFileURL(join(sdkPath, 'dist', 'index.js')).href) as any
      }
    }
    throw new Error(
      '@earendil-works/pi-coding-agent not found. Make sure pi is installed: https://pi.tools'
    )
  }
}

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
  } = await importPiSdk()

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
    // Why: prefer models known to return real content. Some localhost models
    // (e.g. amanai/*) return empty responses. Prefer cb/* and kr/* first.
    const PREFERRED = ['cb/kimi-k3', 'cb/default-model', 'cb/gpt-5.5', 'kr/claude-sonnet-4.5', 'kr/auto']
    model =
      PREFERRED.reduce<unknown>(
        (found, id) => found ?? available.find((m) => m.id === id),
        undefined
      ) ??
      available.find((m) => m.provider === 'localhost' && !m.id.startsWith('amanai/')) ??
      available[0] ??
      undefined
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
