import { toast } from 'sonner'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { ensureAgentStartupInTerminal } from '@/lib/new-workspace'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { Repo, TuiAgent } from '../../../../shared/types'
import {
  clearIssueAiWork,
  registerIssueAiWork,
  updateIssueAiWorkOutcome
} from './issue-ai-work-registry'
import { subscribeCompletionForWorktree } from './issue-ai-work-completion-watcher'
import { resolveLaunchAgent, buildIssueAgentStartup } from './issue-agent-startup'
import type { RepoIssueProvider } from './repo-issue-provider'

export type IssueWorkTarget = {
  provider: RepoIssueProvider
  number: number
  title: string
  url: string
  body?: string
}

// Why: keep the sentinel identical to what the prompt asks the agent to emit —
// downstream automations may key completion notifications off this line.
export const ISSUE_WORK_COMPLETION_SENTINEL = 'ORCA_ISSUE_WORK_DONE'

export type IssueAiWorkMode = 'background' | 'watch'

export type IssueAiWorkLaunchResult = {
  ok: boolean
  worktreeId?: string
  branchName?: string
  tabId?: string
}

function slugifyBranchLeaf(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned.slice(0, 40) || 'issue'
}

export function buildIssueBranchName(number: number, title: string): string {
  return `fix/issue-${number}-${slugifyBranchLeaf(title)}`
}

export function buildIssueAiWorkPrompt(args: {
  provider: RepoIssueProvider
  number: number
  title: string
  url: string
  body?: string
  repoDisplayName?: string
  branchName: string
  completionSentinel: string
  baseBranch?: string
}): string {
  const providerLabel = args.provider === 'github' ? 'GitHub' : 'GitLab'
  const commentCommand =
    args.provider === 'github'
      ? `gh issue comment ${args.number} --body "..."`
      : `glab issue note ${args.number} --message "..."`
  const body = args.body?.trim()

  return [
    `You are working autonomously on ${providerLabel} issue #${args.number}.`,
    args.repoDisplayName ? `Repository: ${args.repoDisplayName}` : null,
    `Issue: ${args.title}`,
    `URL: ${args.url}`,
    `This is a fresh git worktree already checked out on branch \`${args.branchName}\`${
      args.baseBranch ? ` (based on ${args.baseBranch})` : ''
    }. Do NOT switch branches or create another branch — stay on this one.`,
    body ? `Issue body:\n${body}` : 'Issue body: (empty)',
    '',
    'Autonomy contract:',
    '1. Read the issue, then inspect the code paths that need to change in this worktree.',
    '2. Implement the smallest correct fix. Match existing style. Do not refactor unrelated code.',
    '3. Run the fastest relevant tests/lint that already exist in the repo. Skip long suites.',
    '4. Commit your changes locally with a message like:',
    `   fix(#${args.number}): <short summary>`,
    '5. Do NOT push the branch. Do NOT open a PR/MR. The human will review and decide (open a PR/MR, or discard).',
    `6. Post ONE final comment on the issue summarizing what you did using: ${commentCommand}`,
    '   The comment must include:',
    `   - branch name (${args.branchName})`,
    '   - short summary of the change',
    '   - files touched (bullet list)',
    '   - test/lint results (or "not run" with reason)',
    '   - any follow-ups the human should verify',
    `7. When everything above is finished, print the exact line "${args.completionSentinel} #${args.number}" as the very last line of output, then exit.`,
    '',
    'Guardrails:',
    '- Never force-push, never delete branches, never rewrite shared history.',
    '- Never run destructive shell commands outside this worktree.',
    '- If the issue is unclear or requires product decisions, post a comment asking for clarification instead of guessing, then still emit the completion sentinel.',
    '- If you cannot make progress, still post a comment explaining what you tried and why it is blocked, then emit the completion sentinel.'
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

export function issueAiWorkRegistryKey(
  provider: RepoIssueProvider,
  repoId: string,
  number: number
): string {
  return `${provider}:${repoId}:${number}`
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
    baseBranch
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
  // Why: a stale entry from a previous failed launch must not linger with the
  // wrong worktree id — the new run rewrites the row badge from a clean slate.
  clearIssueAiWork(registryId)

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
          }
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

    registerIssueAiWork(registryId, {
      worktreeId: created.id,
      tabId: primaryTabId ?? created.id,
      agentLabel: agent,
      startedAt: Date.now(),
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
