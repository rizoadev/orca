/** Preflight helpers for the staged GitHub work-item create flow. */
import type { useAppStore } from '@/store'
import type { GitHubWorkItemBackgroundStoreSnapshot } from '@/lib/github-work-item-background-request'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import type { Repo } from '../../../shared/types'
import { getRepoExecutionHostId, parseExecutionHostId } from '../../../shared/execution-host'
import { evaluateRuntimeCompat } from '../../../shared/protocol-compat'
import {
  MIN_COMPATIBLE_RUNTIME_SERVER_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '../../../shared/protocol-version'

export type AppActiveView = ReturnType<typeof useAppStore.getState>['activeView']

/** Narrow port so the helpers stay testable without the whole deps bag. */
type AbandonDeps = {
  isPendingCreateActive: (creationId: string) => boolean
  removePendingCreate: (creationId: string) => void
  setActiveView: (view: AppActiveView) => void
}

export function findPendingGitHubWorkItemCreate(
  store: GitHubWorkItemBackgroundStoreSnapshot,
  request: WorktreeCreationRequest
): string | null {
  if (!request.linkedIssue && !request.linkedPR) {
    return null
  }
  const match = Object.values(store.pendingWorktreeCreations).find((entry) => {
    const pending = entry.request
    return (
      pending.repoId === request.repoId &&
      pending.linkedIssue === request.linkedIssue &&
      pending.linkedPR === request.linkedPR
    )
  })
  return match?.creationId ?? null
}

/** Disconnected or protocol-blocked hosts degrade hook/agent probes, so the flow falls back. */
export function repoHostUnavailable(
  store: GitHubWorkItemBackgroundStoreSnapshot,
  repo: Repo
): boolean {
  const host = parseExecutionHostId(getRepoExecutionHostId(repo))
  if (host?.kind === 'ssh') {
    return store.sshConnectionStates.get(host.targetId)?.status !== 'connected'
  }
  if (host?.kind !== 'runtime') {
    return false
  }
  const status = store.runtimeStatusByEnvironmentId.get(host.environmentId)?.status
  if (!status?.hostPlatform) {
    return true
  }
  const compatibility = evaluateRuntimeCompat({
    clientProtocolVersion: RUNTIME_PROTOCOL_VERSION,
    minCompatibleServerProtocolVersion: MIN_COMPATIBLE_RUNTIME_SERVER_VERSION,
    serverProtocolVersion: status.runtimeProtocolVersion ?? status.protocolVersion,
    serverMinCompatibleClientProtocolVersion:
      status.minCompatibleRuntimeClientVersion ?? status.minCompatibleMobileVersion
  })
  return compatibility.kind === 'blocked'
}

/** Fallback paths abandon the staged surface, so return to the launching flow. */
export function abandonStagedCreate(
  creationId: string,
  restoreView: AppActiveView,
  deps: AbandonDeps
): void {
  const shouldRestoreView = deps.isPendingCreateActive(creationId)
  deps.removePendingCreate(creationId)
  if (shouldRestoreView) {
    deps.setActiveView(restoreView)
  }
}
