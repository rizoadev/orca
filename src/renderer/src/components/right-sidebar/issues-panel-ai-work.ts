import { toast } from 'sonner'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { ensureAgentStartupInTerminal } from '@/lib/new-workspace'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { Repo, TuiAgent } from '../../../../shared/types'
import { classifyDirectHuman } from '../../../../shared/agent-run-attribution'
import { updateIssueAiWorkOutcome } from './issue-ai-work-registry'
import { claimOrCoalesceIssueAiWork, resolveIssueAiWorkRegistration } from './issue-ai-work-claim'
import { subscribeCompletionForWorktree } from './issue-ai-work-completion-watcher'
import { resolveLaunchAgent, buildIssueAgentStartup } from './issue-agent-startup'
import type { RepoIssueProvider } from './repo-issue-provider'
import {
  ISSUE_WORK_COMPLETION_SENTINEL,
  buildIssueAiWorkPrompt,
  buildIssueBranchName,
  issueAiWorkRegistryKey
} from './issue-ai-work-prompt'

export type IssueWorkTarget = {
  provider: RepoIssueProvider
  number: number
  title: string
  url: string
  body?: string
  /** Optional thread comment the agent should prioritize while implementing. */
  focusComment?: {
    author: string
    body: string
    createdAt?: string
    path?: string
    line?: number
  }
}

export type IssueAiWorkMode = 'background' | 'watch'

export {
  ISSUE_WORK_COMPLETION_SENTINEL,
  buildIssueAiWorkPrompt,
  buildIssueBranchName,
  issueAiWorkRegistryKey
} from './issue-ai-work-prompt'

export type IssueAiWorkLaunchResult = {
  ok: boolean
  worktreeId?: string
  branchName?: string
  tabId?: string
}

async function resolveDefaultBaseBranch(repoId: string): Promise<string | undefined> {
  try {
    const result = await window.api.repos.getBaseRefDefault({ repoId })
    const ref = result?.defaultBaseRef?.trim()
    if (!ref) {
      return undefined
    }
    // Why: worktrees.create expects a branch name (or remote-tracking ref);
    // pass through as-is — the backend normalises both forms.
    return ref
  } catch {
    return undefined
  }
}

export async function launchIssueAiWorker(args: {
  worktreeId: string
  repo: Repo
  issue: IssueWorkTarget
  agent?: TuiAgent | null
  /** background = keep new worktree hidden until user reveals it; watch = activate it. */
  mode?: IssueAiWorkMode
  onLaunched?: (info: { worktreeId: string; branchName: string }) => void
}): Promise<IssueAiWorkLaunchResult> {
  const store = useAppStore.getState()
  const detected = args.repo.connectionId
    ? await store.ensureRemoteDetectedAgents(args.repo.connectionId)
    : await store.ensureDetectedAgents()
  const preferred =
    args.agent &&
    detected.includes(args.agent) &&
    !(store.settings?.disabledTuiAgents ?? []).includes(args.agent)
      ? args.agent
      : null
  const agent = preferred ?? (await resolveLaunchAgent(args.repo))
  if (!agent) {
    toast.error(
      translate(
        'auto.components.right.sidebar.issuesPanel.noAgent',
        'No AI agent is available to work on this issue.'
      )
    )
    return { ok: false }
  }

  const branchName = buildIssueBranchName(args.issue.number, args.issue.title)
  const baseBranch = await resolveDefaultBaseBranch(args.repo.id)
  const prompt = buildIssueAiWorkPrompt({
    provider: args.issue.provider,
    number: args.issue.number,
    title: args.issue.title,
    url: args.issue.url,
    body: args.issue.body,
    repoDisplayName: args.repo.displayName,
    branchName,
    completionSentinel: ISSUE_WORK_COMPLETION_SENTINEL,
    baseBranch,
    focusComment: args.issue.focusComment
  })

  const startupBundle = buildIssueAgentStartup({ repo: args.repo, agent, prompt })
  if (!startupBundle) {
    toast.error(
      translate(
        'auto.components.right.sidebar.issuesPanel.aiWorkPlanFailed',
        'Could not build an agent launch plan for this issue.'
      )
    )
    return { ok: false }
  }

  const mode: IssueAiWorkMode = args.mode ?? 'background'
  const registryId = issueAiWorkRegistryKey(args.issue.provider, args.repo.id, args.issue.number)
  const claim = claimOrCoalesceIssueAiWork({
    registryId,
    issueNumber: args.issue.number,
    prompt,
    agent,
    mode,
    branchName,
    repoId: args.repo.id
  })
  if (claim.action !== 'claimed') {
    return { ok: true }
  }

  const displayName = translate(
    'auto.components.right.sidebar.issuesPanel.aiWorkWorkspaceName',
    'AI · #{{value0}} {{value1}}',
    { value0: args.issue.number, value1: args.issue.title.slice(0, 40) }
  )

  try {
    // Why: share one launchToken between backend startup spawn and renderer
    // prompt delivery so follow-up/prefill never targets a different pane.
    const launchToken = createBrowserUuid()
    const startupPlan = { ...startupBundle.plan, launchToken }
    const startupLaunch = { ...startupBundle.launch, launchToken }

    const result = await store.createWorktree(
      args.repo.id,
      branchName,
      baseBranch,
      'inherit',
      undefined,
      'sidebar',
      displayName,
      args.issue.provider === 'github' ? args.issue.number : undefined,
      undefined,
      undefined,
      agent,
      undefined,
      branchName,
      undefined,
      undefined,
      args.issue.provider === 'gitlab' ? args.issue.number : undefined,
      startupLaunch
    )
    const created = result.worktree
    const backendSpawned = result.startupTerminal?.spawned === true

    // Why: backend may spawn the shell/agent process, but prompt delivery for
    // argv-prefill / stdin-after-start agents still needs the renderer path used
    // by New Workspace (otherwise "Watch" opens a blank terminal).
    // Why: Watch must focus the new workspace; Background must seed the agent
    // without yanking the user away from their current worktree.
    const startupPayload = backendSpawned
      ? undefined
      : {
          command: startupPlan.launchCommand,
          ...(startupPlan.env ? { env: startupPlan.env } : {}),
          launchConfig: startupPlan.launchConfig,
          launchToken,
          launchAgent: agent,
          ...(startupPlan.draftPrompt ? { draftPrompt: startupPlan.draftPrompt } : {}),
          ...(startupPlan.startupCommandDelivery
            ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
            : {}),
          initialAgentStatus: {
            agent,
            prompt
          },
          telemetry: {
            agent_kind: startupLaunch.telemetry!.agent_kind,
            launch_source: 'sidebar' as const,
            request_kind: 'new' as const
          },
          attribution: classifyDirectHuman({
            originatorId: 'local-user',
            evidenceKind: 'launch',
            evidenceRefId: registryId
          })
        }

    let primaryTabId: string | null = result.startupTerminal?.tabId ?? null
    if (mode === 'watch') {
      const activation = activateAndRevealWorktree(created.id, {
        sidebarRevealBehavior: 'auto',
        setup: result.setup,
        defaultTabs: result.defaultTabs,
        ...(startupPayload ? { startup: startupPayload } : {})
      })
      if (activation !== false) {
        primaryTabId = activation.primaryTabId ?? primaryTabId
      }
    } else if (!backendSpawned && startupPayload) {
      // Seed a terminal on the new worktree without focusing it.
      const tab = store.createTab(created.id, undefined, undefined, {
        activate: false,
        recordInteraction: false,
        launchAgent: agent
      })
      store.queueTabStartupCommand(tab.id, {
        command: startupPayload.command,
        ...(startupPayload.env ? { env: startupPayload.env } : {}),
        launchConfig: startupPayload.launchConfig,
        launchToken,
        launchAgent: agent,
        ...(startupPayload.startupCommandDelivery
          ? { startupCommandDelivery: startupPayload.startupCommandDelivery }
          : {}),
        ...(startupPayload.initialAgentStatus
          ? { initialAgentStatus: startupPayload.initialAgentStatus }
          : {}),
        telemetry: startupPayload.telemetry
      })
      primaryTabId = tab.id
    }

    // Why: argv-prefill / stdin-after-start agents need renderer delivery after
    // the PTY exists — createWorktree alone often leaves a blank shell.
    void ensureAgentStartupInTerminal({
      worktreeId: created.id,
      primaryTabId,
      startup: startupPlan
    })

    resolveIssueAiWorkRegistration({
      registryId,
      prompt,
      worktreeId: created.id,
      tabId: primaryTabId ?? created.id,
      agent,
      mode,
      branchName,
      repoId: args.repo.id
    })
    args.onLaunched?.({ worktreeId: created.id, branchName })

    toast.success(
      mode === 'watch'
        ? translate(
            'auto.components.right.sidebar.issuesPanel.aiWorkStartedWatch',
            'AI is working on #{{value0}} in a new worktree — opened it for you.',
            { value0: args.issue.number }
          )
        : translate(
            'auto.components.right.sidebar.issuesPanel.aiWorkStarted',
            'AI is working on #{{value0}} in a new worktree (branch {{value1}}). You will get a notification when it finishes.',
            { value0: args.issue.number, value1: branchName }
          )
    )

    subscribeCompletionForWorktree(registryId, created.id, args.issue.number)

    return {
      ok: true,
      worktreeId: created.id,
      branchName,
      tabId: primaryTabId ?? undefined
    }
  } catch (err) {
    updateIssueAiWorkOutcome(registryId, 'failed')
    toast.error(
      err instanceof Error
        ? err.message
        : translate(
            'auto.components.right.sidebar.issuesPanel.aiWorkLaunchFailed',
            'Failed to launch AI worker for this issue.'
          )
    )
    return { ok: false }
  }
}

/**
 * Watches agentStatusByPaneKey for the first working→idle/done transition on
 * any pane belonging to this worktree, then marks the run as succeeded.
 * Failure is inferred later from the tab process exit (currently surfaced via
 * the standard terminal notification, not this subscription).
 */
