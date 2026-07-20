import { getRepoIdFromWorktreeId } from '../../shared/worktree-id'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'

export type TelegramBridgeTerminalTarget = {
  handle: string
  paneKey?: string
  worktreeId: string
  state: string
  receivedAt: number
}

export type TelegramBridgeTerminalFallback = {
  handle: string
  worktreeId: string
  connected: boolean
  writable: boolean
  title: string | null
  lastOutputAt: number | null
  launchAgent?: string | null
}

const ACTIVE_STATES = new Set(['working', 'thinking', 'waiting', 'blocked', 'running'])
const AGENT_TITLE_HINT =
  /\b(claude|codex|opencode|gemini|droid|grok|cursor|pi|openclaw|amp|aider)\b/i

function rankState(state: string): number {
  if (ACTIVE_STATES.has(state)) {
    return 0
  }
  if (state === 'done' || state === 'idle') {
    return 1
  }
  return 2
}

function rankFallback(terminal: TelegramBridgeTerminalFallback): number {
  let score = 0
  if (terminal.connected) {
    score += 4
  }
  if (terminal.writable) {
    score += 2
  }
  if (terminal.launchAgent) {
    score += 12
  }
  if (terminal.title && AGENT_TITLE_HINT.test(terminal.title)) {
    score += 8
  }
  return score
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase()
}

/** Expand a repo selector into match keys (id / display name / path basename). */
export function buildTelegramBridgeRepoAliases(params: {
  repoId: string
  displayName?: string | null
  path?: string | null
}): string[] {
  const aliases = new Set<string>()
  const add = (value: string | null | undefined): void => {
    const trimmed = value?.trim()
    if (!trimmed) {
      return
    }
    aliases.add(trimmed)
    aliases.add(normalizeIdentity(trimmed))
    const basename = trimmed.split(/[\\/]/).findLast((part) => part.length > 0)
    if (basename) {
      aliases.add(basename)
      aliases.add(normalizeIdentity(basename))
    }
  }
  add(params.repoId)
  add(params.displayName)
  add(params.path)
  return [...aliases]
}

export function worktreeBelongsToRepo(
  worktreeId: string,
  repoId: string,
  repoAliases: readonly string[] = []
): boolean {
  if (!worktreeId || !repoId) {
    return false
  }
  const keys = new Set(buildTelegramBridgeRepoAliases({ repoId }))
  for (const alias of repoAliases) {
    for (const key of buildTelegramBridgeRepoAliases({ repoId: alias })) {
      keys.add(key)
    }
  }

  const worktreeRepoId = getRepoIdFromWorktreeId(worktreeId)
  const candidates = [
    worktreeId,
    worktreeRepoId,
    normalizeIdentity(worktreeId),
    normalizeIdentity(worktreeRepoId)
  ]
  for (const candidate of candidates) {
    if (keys.has(candidate)) {
      return true
    }
  }
  for (const key of keys) {
    if (
      worktreeId === key ||
      worktreeId.startsWith(`${key}::`) ||
      worktreeId.startsWith(`${key}/`) ||
      worktreeId.startsWith(`${key}\\`) ||
      normalizeIdentity(worktreeId).startsWith(`${normalizeIdentity(key)}::`)
    ) {
      return true
    }
  }
  return false
}

/** Pick the best live agent terminal for a repo from the hook status snapshot. */
export function resolveTelegramBridgeSessionTarget(
  snapshot: readonly AgentStatusIpcPayload[],
  repoId: string,
  fallbackTerminals: readonly TelegramBridgeTerminalFallback[] = [],
  repoAliases: readonly string[] = []
): TelegramBridgeTerminalTarget | null {
  const candidates: TelegramBridgeTerminalTarget[] = []
  for (const entry of snapshot) {
    if (entry.providerSessionOnly) {
      continue
    }
    if (!entry.worktreeId || !entry.terminalHandle) {
      continue
    }
    if (!worktreeBelongsToRepo(entry.worktreeId, repoId, repoAliases)) {
      continue
    }
    candidates.push({
      handle: entry.terminalHandle,
      ...(entry.paneKey ? { paneKey: entry.paneKey } : {}),
      worktreeId: entry.worktreeId,
      state: entry.state,
      receivedAt: entry.receivedAt ?? 0
    })
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const stateDiff = rankState(a.state) - rankState(b.state)
      if (stateDiff !== 0) {
        return stateDiff
      }
      return b.receivedAt - a.receivedAt
    })
    return candidates[0] ?? null
  }

  // Why: hooks can lag or omit terminalHandle/worktreeId while a live PTY still exists.
  const fallback = fallbackTerminals
    .filter(
      (terminal) =>
        terminal.handle &&
        terminal.connected &&
        terminal.writable &&
        worktreeBelongsToRepo(terminal.worktreeId, repoId, repoAliases)
    )
    .sort((a, b) => {
      const scoreDiff = rankFallback(b) - rankFallback(a)
      if (scoreDiff !== 0) {
        return scoreDiff
      }
      return (b.lastOutputAt ?? 0) - (a.lastOutputAt ?? 0)
    })[0]
  if (fallback) {
    return {
      handle: fallback.handle,
      worktreeId: fallback.worktreeId,
      state: 'fallback',
      receivedAt: fallback.lastOutputAt ?? 0
    }
  }

  // Why: last resort for single-repo workspaces so Telegram still works even if
  // mapping aliases drift; never do this when multiple repos have live terminals.
  const liveRepos = new Set(
    fallbackTerminals
      .filter((terminal) => terminal.connected && terminal.writable)
      .map((terminal) => getRepoIdFromWorktreeId(terminal.worktreeId))
      .filter(Boolean)
  )
  if (liveRepos.size === 1 && fallbackTerminals.length > 0) {
    const only = fallbackTerminals
      .filter((terminal) => terminal.connected && terminal.writable)
      .sort(
        (a, b) => rankFallback(b) - rankFallback(a) || (b.lastOutputAt ?? 0) - (a.lastOutputAt ?? 0)
      )[0]
    if (only) {
      return {
        handle: only.handle,
        worktreeId: only.worktreeId,
        state: 'single-repo-fallback',
        receivedAt: only.lastOutputAt ?? 0
      }
    }
  }

  return null
}

export function shouldMirrorAssistantMessage(params: {
  state: string
  message: string | undefined
  previousMessage: string | undefined
}): boolean {
  const message = params.message?.trim()
  if (!message) {
    return false
  }
  if (message === params.previousMessage?.trim()) {
    return false
  }
  // Why: only mirror settled assistant text so tool spam doesn't flood the topic.
  return params.state === 'done' || params.state === 'idle' || params.state === 'waiting'
}
