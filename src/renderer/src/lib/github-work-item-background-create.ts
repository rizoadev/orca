import { toast } from 'sonner'

import { useAppStore } from '@/store'
import {
  beginBackgroundWorktreePreparation,
  continueBackgroundWorktreeCreation
} from '@/lib/worktree-creation-flow'
import {
  buildGitHubWorkItemBackendStartup,
  buildGitHubWorkItemStartupPlan,
  buildInitialGitHubWorkItemRequest,
  type GitHubWorkItemBackgroundStoreSnapshot,
  resolvePreferredQuickAgentForGitHubWorkItem
} from '@/lib/github-work-item-background-request'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import {
  resolveDirectLaunchOwnerRow,
  resolveDirectPrStartPoint,
  resolveDirectSetupDecision
} from '@/lib/launch-work-item-direct-preflight'
import { agentLaunchCommandErrorMessage } from '@/lib/launch-work-item-direct-messages'
import { ensureHooksConfirmed } from '@/lib/ensure-hooks-confirmed'
import { renderIssueCommandTemplate } from '@/lib/new-workspace'
import { readRuntimeIssueCommand } from '@/runtime/runtime-hooks-client'
import { isGitRepoKind } from '../../../shared/repo-kind'
import type { GitHubWorkItem } from '../../../shared/types'
import type { SetupDecision } from '../../../shared/worktree/create-types'
import type { TaskSourceContext, WorkspaceRunContext } from '../../../shared/task-source-context'
import { resolveGitHubWorkItemIdentity } from '@/lib/github-work-item-identity'
import {
  abandonStagedCreate,
  findPendingGitHubWorkItemCreate,
  repoHostUnavailable,
  type AppActiveView
} from '@/lib/github-work-item-background-preflight'

export type BackgroundGitHubWorkItemCreateResult =
  | { kind: 'background-started' }
  | { kind: 'error' }
  | {
      kind: 'fallback'
      reason: 'repo-missing' | 'host-unavailable' | 'setup-ask' | 'pr-start-point' | 'agent-startup'
    }

type BackgroundGitHubWorkItemCreateDeps = {
  getStore: () => GitHubWorkItemBackgroundStoreSnapshot
  getActiveView: () => AppActiveView
  hasPendingCreate: (creationId: string) => boolean
  isPendingCreateActive: (creationId: string) => boolean
  resolveSetupDecision: typeof resolveDirectSetupDecision
  resolvePrStartPoint: typeof resolveDirectPrStartPoint
  confirmHooks: (
    store: GitHubWorkItemBackgroundStoreSnapshot,
    repoId: string,
    scope: 'setup' | 'issueCommand'
  ) => ReturnType<typeof ensureHooksConfirmed>
  readIssueCommand: typeof readRuntimeIssueCommand
  beginBackgroundCreate: typeof beginBackgroundWorktreePreparation
  continueBackgroundCreate: typeof continueBackgroundWorktreeCreation
  activatePendingCreate: (creationId: string) => void
  removePendingCreate: (creationId: string) => void
  setActiveView: (view: AppActiveView) => void
  toastError: (message: string) => void
}

export type BackgroundGitHubWorkItemCreateArgs = {
  item: GitHubWorkItem
  repoId: string
  taskSourceContext?: TaskSourceContext | null
  workspaceRunContext?: WorkspaceRunContext | null
  telemetrySource?: WorktreeCreationRequest['telemetrySource']
  openModalFallback: () => void
}

const DEFAULT_DEPS: BackgroundGitHubWorkItemCreateDeps = {
  getStore: () => useAppStore.getState(),
  getActiveView: () => useAppStore.getState().activeView,
  hasPendingCreate: (creationId) =>
    useAppStore.getState().pendingWorktreeCreations[creationId] != null,
  isPendingCreateActive: (creationId) =>
    useAppStore.getState().activePendingCreationId === creationId,
  resolveSetupDecision: resolveDirectSetupDecision,
  resolvePrStartPoint: resolveDirectPrStartPoint,
  confirmHooks: (store, repoId, scope: 'setup' | 'issueCommand') =>
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the snapshot is structurally the store subset ensureHooksConfirmed reads.
    ensureHooksConfirmed(store as ReturnType<typeof useAppStore.getState>, repoId, scope),
  readIssueCommand: readRuntimeIssueCommand,
  beginBackgroundCreate: beginBackgroundWorktreePreparation,
  continueBackgroundCreate: continueBackgroundWorktreeCreation,
  activatePendingCreate: (creationId) => {
    const store = useAppStore.getState()
    store.setActivePendingWorktreeCreation(creationId)
    store.setActiveView('terminal')
    store.setSidebarOpen(true)
  },
  removePendingCreate: (creationId) =>
    useAppStore.getState().removePendingWorktreeCreation(creationId),
  setActiveView: (view) => useAppStore.getState().setActiveView(view),
  toastError: (message) => toast.error(message)
}

export async function createGitHubWorkItemWorkspaceInBackground(
  args: BackgroundGitHubWorkItemCreateArgs,
  deps: BackgroundGitHubWorkItemCreateDeps = DEFAULT_DEPS
): Promise<BackgroundGitHubWorkItemCreateResult> {
  const store = deps.getStore()
  const repo = store.repos.find((candidate) => candidate.id === args.repoId)
  if (!repo) {
    args.openModalFallback()
    return { kind: 'fallback', reason: 'repo-missing' }
  }

  const initialRequest = buildInitialGitHubWorkItemRequest(args, repo)
  const existingPendingCreateId = findPendingGitHubWorkItemCreate(store, initialRequest)
  if (existingPendingCreateId) {
    deps.activatePendingCreate(existingPendingCreateId)
    return { kind: 'background-started' }
  }
  // Why: disconnected hosts degrade hook/agent probes to skip/no-agent, so keep this gate.
  if (repoHostUnavailable(store, repo)) {
    args.openModalFallback()
    return { kind: 'fallback', reason: 'host-unavailable' }
  }

  const restoreView = deps.getActiveView()
  const creationId = deps.beginBackgroundCreate(initialRequest)
  const itemIdentity = resolveGitHubWorkItemIdentity(args.item)

  try {
    const owner = resolveDirectLaunchOwnerRow(store.repos, args.repoId)
    const setupResolution = await deps.resolveSetupDecision(
      args.repoId,
      repo,
      owner?.executionHostId ?? 'local'
    )
    // Why: a vanished staged row means the user cancelled; later awaits must not reopen UI.
    if (!deps.hasPendingCreate(creationId)) {
      return { kind: 'background-started' }
    }
    if (setupResolution.kind === 'needs-modal') {
      abandonStagedCreate(creationId, restoreView, deps)
      args.openModalFallback()
      return { kind: 'fallback', reason: 'setup-ask' }
    }

    let baseBranch: string | undefined
    let pushTarget: WorktreeCreationRequest['pushTarget']
    let branchNameOverride: string | undefined
    let compareBaseRef: string | undefined
    if (itemIdentity.type === 'pr' && itemIdentity.number) {
      try {
        const result = await deps.resolvePrStartPoint(
          args.repoId,
          itemIdentity.number,
          owner?.target ?? null,
          args.item
        )
        baseBranch = result.baseBranch
        pushTarget = result.pushTarget
        branchNameOverride = result.branchNameOverride
        compareBaseRef = result.compareBaseRef
        if (!deps.hasPendingCreate(creationId)) {
          return { kind: 'background-started' }
        }
      } catch (error) {
        if (!deps.hasPendingCreate(creationId)) {
          return { kind: 'background-started' }
        }
        deps.toastError(error instanceof Error ? error.message : 'Unable to resolve pull request.')
        abandonStagedCreate(creationId, restoreView, deps)
        args.openModalFallback()
        return { kind: 'fallback', reason: 'pr-start-point' }
      }
    }

    // Why: trust prompts are serialized app-wide, so read the store fresh at
    // each check — an "Always trust" stamped by an earlier prompt (including
    // this flow's own setup prompt) must short-circuit instead of re-prompting.
    const trustDecision = await deps.confirmHooks(deps.getStore(), args.repoId, 'setup')
    if (!deps.hasPendingCreate(creationId)) {
      return { kind: 'background-started' }
    }
    const setupDecision: SetupDecision =
      trustDecision === 'skip'
        ? 'skip'
        : setupResolution.kind === 'decided'
          ? setupResolution.decision
          : 'inherit'
    const agent = await resolvePreferredQuickAgentForGitHubWorkItem(store, repo)
    if (!deps.hasPendingCreate(creationId)) {
      return { kind: 'background-started' }
    }
    const { startupPlan, quickPrompt, launchDraftPrompt, quickTelemetry } =
      buildGitHubWorkItemStartupPlan({
        agent,
        item: args.item,
        repo,
        store
      })
    if (agent && !startupPlan) {
      deps.toastError(agentLaunchCommandErrorMessage())
      abandonStagedCreate(creationId, restoreView, deps)
      args.openModalFallback()
      return { kind: 'fallback', reason: 'agent-startup' }
    }
    const backendStartup = buildGitHubWorkItemBackendStartup(agent, startupPlan, quickTelemetry)

    // Why: mirror the composer's trust-gated issue-command split. Only GitHub
    // issues (numeric issue number) on git repos run it; PRs/Linear/folders never
    // do. Reuse the setup trust decision: a 'skip' there also skips the command.
    let issueCommand: WorktreeCreationRequest['issueCommand']
    // Why: a declined setup trust also skips the issue command, so short-circuit
    // before the (up-to-15s) read rather than reading just to drop the result.
    if (
      trustDecision !== 'skip' &&
      isGitRepoKind(repo) &&
      args.item.type === 'issue' &&
      typeof args.item.number === 'number'
    ) {
      // Why: read failures fail closed (no command), so create still proceeds.
      let effectiveContent = ''
      try {
        const issueCommandRead = await deps.readIssueCommand(
          owner?.executionHostId ?? 'local',
          args.repoId
        )
        effectiveContent = (issueCommandRead.effectiveContent ?? '').trim()
      } catch {
        effectiveContent = ''
      }
      if (!deps.hasPendingCreate(creationId)) {
        return { kind: 'background-started' }
      }
      if (effectiveContent.length > 0) {
        const issueCommandTrust = await deps.confirmHooks(
          deps.getStore(),
          args.repoId,
          'issueCommand'
        )
        if (!deps.hasPendingCreate(creationId)) {
          return { kind: 'background-started' }
        }
        if (issueCommandTrust === 'run') {
          issueCommand = {
            command: renderIssueCommandTemplate(effectiveContent, {
              issueNumber: args.item.number,
              artifactUrl: args.item.url ?? null
            })
          }
        }
      }
    }

    const request: WorktreeCreationRequest = {
      ...initialRequest,
      ...(baseBranch ? { baseBranch } : {}),
      ...(compareBaseRef ? { compareBaseRef } : {}),
      setupDecision,
      ...(pushTarget ? { pushTarget } : {}),
      agent,
      ...(branchNameOverride ? { branchNameOverride } : {}),
      ...(backendStartup ? { startup: backendStartup } : {}),
      ...(issueCommand ? { issueCommand } : {}),
      startupPlan,
      quickPrompt,
      ...(launchDraftPrompt ? { launchDraftPrompt } : {}),
      quickTelemetry
    }

    deps.continueBackgroundCreate(creationId, request, { revealCreationSurface: false })
    return { kind: 'background-started' }
  } catch (error) {
    if (!deps.hasPendingCreate(creationId)) {
      return { kind: 'background-started' }
    }
    abandonStagedCreate(creationId, restoreView, deps)
    deps.toastError(error instanceof Error ? error.message : 'Unable to prepare workspace.')
    return { kind: 'error' }
  }
}
