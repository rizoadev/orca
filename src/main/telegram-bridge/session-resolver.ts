import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import { getRepoIdFromWorktreeId } from '../../shared/worktree-id'
import {
  buildTelegramBridgeRepoAliases,
  resolveTelegramBridgeSessionTarget,
  type TelegramBridgeTerminalFallback
} from './session-target'
import type { TelegramBridgeRepoRef } from './spawn-agent'

type ResolveDeps = {
  getRuntime: () => OrcaRuntimeService | null
  getAgentStatusSnapshot: () => AgentStatusIpcPayload[]
  getRepos?: () => readonly TelegramBridgeRepoRef[]
  pushEvent: (event: { direction: 'system'; repoId?: string; text: string }) => void
}

export async function resolveTelegramBridgeInjectTarget(
  deps: ResolveDeps,
  repoId: string
): Promise<{ handle: string; worktreeId: string; state: string; receivedAt: number } | null> {
  const runtime = deps.getRuntime()
  const repo = deps.getRepos?.().find((entry) => entry.id === repoId)
  const repoAliases = buildTelegramBridgeRepoAliases({
    repoId,
    displayName: repo?.displayName,
    path: repo?.path
  })
  const snapshot = deps.getAgentStatusSnapshot().map((entry) => {
    if (entry.terminalHandle || !entry.paneKey || !runtime) {
      return entry
    }
    const terminalHandle = runtime.getAgentStatusTerminalHandleForPaneKey(entry.paneKey)
    return terminalHandle ? { ...entry, terminalHandle } : entry
  })
  let fallbackTerminals: TelegramBridgeTerminalFallback[] = []
  if (runtime) {
    try {
      fallbackTerminals = runtime.listLiveTerminalInjectTargets()
    } catch {
      fallbackTerminals = []
    }
    if (fallbackTerminals.length === 0) {
      try {
        const listed = await runtime.listTerminals(undefined, 500)
        fallbackTerminals = listed.terminals.map((terminal) => ({
          handle: terminal.handle,
          worktreeId: terminal.worktreeId,
          connected: terminal.connected,
          writable: terminal.writable,
          title: terminal.title,
          lastOutputAt: terminal.lastOutputAt
        }))
      } catch {
        // Keep empty; snapshot path may still resolve.
      }
    }
  }
  const target = resolveTelegramBridgeSessionTarget(
    snapshot,
    repoId,
    fallbackTerminals,
    repoAliases
  )
  if (!target) {
    const liveRepoIds = [
      ...new Set(
        fallbackTerminals
          .map((terminal) => getRepoIdFromWorktreeId(terminal.worktreeId))
          .filter(Boolean)
      )
    ].slice(0, 8)
    deps.pushEvent({
      direction: 'system',
      repoId,
      text: `No inject target for repo ${repoId}. aliases=[${repoAliases.slice(0, 6).join('|')}] liveRepos=[${liveRepoIds.join(', ') || 'none'}] liveTerminals=${fallbackTerminals.length} hookRows=${snapshot.length}`
    })
  }
  return target
}
