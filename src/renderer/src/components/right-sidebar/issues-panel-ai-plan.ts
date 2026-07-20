import { toast } from 'sonner'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { getAgentLaunchPlatformForRepo } from '@/lib/agent-launch-platform'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { pickSourceControlLaunchAgent } from '@/lib/source-control-launch-agent-selection'
import { useAppStore } from '@/store'
import type { Repo, TuiAgent } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import type { RepoIssueProvider } from './repo-issue-provider'

export type IssuePlanCommentTarget = {
  provider: RepoIssueProvider
  number: number
  title: string
  url: string
  body?: string
}

export function buildIssueAiPlanPrompt(args: {
  provider: RepoIssueProvider
  number: number
  title: string
  url: string
  body?: string
  repoDisplayName?: string
}): string {
  const providerLabel = args.provider === 'github' ? 'GitHub' : 'GitLab'
  const body = args.body?.trim()
  const commentCommand =
    args.provider === 'github'
      ? `gh issue comment ${args.number} --body "...plan..."`
      : `glab issue note ${args.number} --message "...plan..."`

  return [
    `You are attached as a planning commenter on ${providerLabel} issue #${args.number}.`,
    args.repoDisplayName ? `Repository: ${args.repoDisplayName}` : null,
    `Issue: ${args.title}`,
    `URL: ${args.url}`,
    body ? `Issue body:\n${body}` : 'Issue body: (empty)',
    '',
    'Task:',
    '1. Inspect the current worktree and issue context.',
    '2. Produce a concrete implementation plan to solve this issue.',
    '3. Keep the plan actionable: goals, steps, files likely to change, risks, and verification.',
    `4. Post the plan as a comment on the issue using: ${commentCommand}`,
    '5. Do not implement the fix yet unless the user explicitly asks after the plan is posted.',
    '',
    'Write the comment in markdown. Start with a short summary, then numbered steps.'
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

async function resolveLaunchAgent(repo: Repo): Promise<TuiAgent | null> {
  const store = useAppStore.getState()
  const detected = repo.connectionId
    ? await store.ensureRemoteDetectedAgents(repo.connectionId)
    : await store.ensureDetectedAgents()
  return pickSourceControlLaunchAgent({
    defaultAgent: store.settings?.defaultTuiAgent,
    detectedAgents: detected,
    disabledAgents: store.settings?.disabledTuiAgents
  })
}

export async function launchIssueAiPlanCommenter(args: {
  worktreeId: string
  repo: Repo
  issue: IssuePlanCommentTarget
  /** Prefer this agent when it is available on the worktree host. */
  agent?: TuiAgent | null
}): Promise<boolean> {
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
        'No AI agent is available to plan this issue.'
      )
    )
    return false
  }

  const prompt = buildIssueAiPlanPrompt({
    provider: args.issue.provider,
    number: args.issue.number,
    title: args.issue.title,
    url: args.issue.url,
    body: args.issue.body,
    repoDisplayName: args.repo.displayName
  })
  const launchPlatform = getAgentLaunchPlatformForRepo(
    args.repo,
    args.repo.connectionId
      ? undefined
      : getLocalProjectExecutionRuntimeContext(store, args.worktreeId)
  )
  const result = launchAgentInNewTab({
    agent,
    worktreeId: args.worktreeId,
    prompt,
    promptDelivery: 'submit-after-ready',
    launchSource: 'sidebar',
    launchPlatform
  })
  if (!result) {
    toast.error(
      translate(
        'auto.components.right.sidebar.issuesPanel.agentLaunchFailed',
        'Failed to launch AI planner for this issue.'
      )
    )
    return false
  }
  toast.success(
    translate(
      'auto.components.right.sidebar.issuesPanel.aiPlanStarted',
      'AI is drafting a plan comment on #{{value0}}',
      { value0: args.issue.number }
    )
  )
  return true
}
