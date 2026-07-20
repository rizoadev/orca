import { isTuiAgent } from '../../shared/tui-agent-config'
import { pickTuiAgent } from '../../shared/tui-agent-selection'
import type { TuiAgent } from '../../shared/types'
import { detectInstalledAgentsWithShellPathHydration, detectRemoteAgents } from '../ipc/preflight'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { buildTelegramBridgeRepoAliases, worktreeBelongsToRepo } from './session-target'

const DEFAULT_SPAWN_AGENT: TuiAgent = 'claude'
const SPAWN_WAIT_TIMEOUT_MS = 45_000
const SPAWN_POLL_MS = 500

export type TelegramBridgeRepoRef = {
  id: string
  displayName?: string
  path?: string
  connectionId?: string | null
}

export type TelegramBridgeWorktreeRef = {
  id: string
  repoId: string
  path: string
}

type SpawnDeps = {
  getRuntime: () => OrcaRuntimeService | null
  getRepos?: () => readonly TelegramBridgeRepoRef[]
  getWorktrees?: () => readonly TelegramBridgeWorktreeRef[]
  getDefaultAgent?: () => string | null
  getDisabledTuiAgents?: () => readonly string[] | null
  resolveSessionTarget: (
    repoId: string
  ) => Promise<{ handle: string; worktreeId: string; state: string; receivedAt: number } | null>
  pushEvent: (event: {
    direction: 'system' | 'spawn'
    repoId?: string
    text: string
    detail?: string
  }) => void
  setLastError: (error: string) => void
  emitStatus: () => void
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function resolveRepoAliases(deps: Pick<SpawnDeps, 'getRepos'>, repoId: string): string[] {
  const repo = deps.getRepos?.().find((entry) => entry.id === repoId)
  return buildTelegramBridgeRepoAliases({
    repoId,
    displayName: repo?.displayName,
    path: repo?.path
  })
}

async function resolveWorktreeIdForRepo(
  deps: SpawnDeps,
  runtime: OrcaRuntimeService,
  repoId: string
): Promise<string | null> {
  try {
    const live = runtime.listLiveTerminalInjectTargets()
    const aliases = resolveRepoAliases(deps, repoId)
    let best: (typeof live)[number] | null = null
    for (const terminal of live) {
      if (!terminal.connected || !worktreeBelongsToRepo(terminal.worktreeId, repoId, aliases)) {
        continue
      }
      if (!best || (terminal.lastOutputAt ?? 0) > (best.lastOutputAt ?? 0)) {
        best = terminal
      }
    }
    if (best) {
      return best.worktreeId
    }
  } catch {
    // Fall through to detected worktrees.
  }
  const fromDeps = deps.getWorktrees?.().find((wt) => wt.repoId === repoId)
  if (fromDeps) {
    return fromDeps.id
  }
  try {
    const detected = await runtime.listDetectedManagedWorktrees(repoId)
    const primary =
      detected.worktrees.find((wt) => wt.isMainWorktree) ??
      detected.worktrees.find((wt) => wt.visible !== false) ??
      detected.worktrees.at(0)
    return primary?.id ?? null
  } catch {
    return null
  }
}

/** Same preference order as desktop workspace agent launch: settings → detected install. */
export async function resolveTelegramBridgeDefaultAgent(
  deps: Pick<SpawnDeps, 'getDefaultAgent' | 'getDisabledTuiAgents' | 'getRepos'>,
  repoId: string
): Promise<TuiAgent | null> {
  const configuredRaw = deps.getDefaultAgent?.()?.trim() ?? null
  // Why: blank is shell-only on desktop; Telegram still needs an agent, so treat as unset.
  const preferred =
    configuredRaw && configuredRaw !== 'blank' && isTuiAgent(configuredRaw) ? configuredRaw : null
  const disabled = deps.getDisabledTuiAgents?.() ?? null

  // Why: honor an explicit enabled default even if detection is slow/unavailable.
  if (preferred && pickTuiAgent(preferred, [preferred], disabled)) {
    return preferred
  }

  const repo = deps.getRepos?.().find((entry) => entry.id === repoId)
  let detected: TuiAgent[] = []
  try {
    const raw = repo?.connectionId
      ? await detectRemoteAgents({ connectionId: repo.connectionId })
      : await detectInstalledAgentsWithShellPathHydration()
    detected = raw.filter(isTuiAgent)
  } catch {
    detected = []
  }

  return pickTuiAgent(preferred, detected, disabled) ?? preferred ?? DEFAULT_SPAWN_AGENT
}

async function waitForSpawnReady(deps: SpawnDeps, repoId: string, handle: string): Promise<void> {
  const deadline = Date.now() + SPAWN_WAIT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const target = await deps.resolveSessionTarget(repoId)
    if (target && (target.handle === handle || target.state !== 'fallback')) {
      return
    }
    await sleep(SPAWN_POLL_MS)
  }
}

export async function runSpawnDefaultAgentForRepo(
  deps: SpawnDeps,
  repoId: string,
  prompt: string
): Promise<{ handle: string; worktreeId: string } | null> {
  const runtime = deps.getRuntime()
  if (!runtime) {
    deps.pushEvent({
      direction: 'system',
      repoId,
      text: 'Auto-spawn failed: runtime unavailable'
    })
    return null
  }
  const worktreeId = await resolveWorktreeIdForRepo(deps, runtime, repoId)
  if (!worktreeId) {
    deps.pushEvent({
      direction: 'system',
      repoId,
      text: 'Auto-spawn failed: no worktree found for repo'
    })
    return null
  }
  const agent = await resolveTelegramBridgeDefaultAgent(deps, repoId)
  if (!agent) {
    deps.pushEvent({
      direction: 'system',
      repoId,
      text: 'Auto-spawn failed: no default/detected AI agent available'
    })
    return null
  }
  deps.pushEvent({
    direction: 'spawn',
    repoId,
    text: `Spawning ${agent} in ${worktreeId}`,
    detail: prompt.slice(0, 80)
  })
  try {
    const created = await runtime.launchAgentTerminal(`id:${worktreeId}`, {
      agent,
      prompt,
      title: `Telegram · ${agent}`
    })
    deps.pushEvent({
      direction: 'spawn',
      repoId,
      text: `Spawned ${agent}`,
      detail: created.handle
    })
    // Why: give the agent a moment to start so the next status hooks can attach.
    await waitForSpawnReady(deps, repoId, created.handle)
    return { handle: created.handle, worktreeId: created.worktreeId || worktreeId }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    deps.setLastError(reason)
    deps.pushEvent({
      direction: 'system',
      repoId,
      text: `Auto-spawn failed: ${reason}`
    })
    deps.emitStatus()
    return null
  }
}
