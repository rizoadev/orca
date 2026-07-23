import { toast } from 'sonner'
import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
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
  /** Optional thread comment the agent should plan against / reply to. */
  focusComment?: {
    author: string
    body: string
    createdAt?: string
    path?: string
    line?: number
  }
}

export function buildIssueAiPlanPrompt(args: {
  provider: RepoIssueProvider
  number: number
  title: string
  url: string
  body?: string
  repoDisplayName?: string
  focusComment?: IssuePlanCommentTarget['focusComment']
}): string {
  const providerLabel = args.provider === 'github' ? 'GitHub' : 'GitLab'
  const body = args.body?.trim()
  const commentCommand =
    args.provider === 'github'
      ? `gh issue comment ${args.number} --body "...plan..."`
      : `glab issue note ${args.number} --message "...plan..."`
  const focus = args.focusComment
  const focusBody = focus?.body?.trim()
  const focusLoc =
    focus?.path != null
      ? `${focus.path}${typeof focus.line === 'number' ? `:${focus.line}` : ''}`
      : null

  return [
    focus
      ? `You are planning a reply/solution for a specific discussion thread on ${providerLabel} issue #${args.number}.`
      : `You are attached as a planning commenter on ${providerLabel} issue #${args.number}.`,
    args.repoDisplayName ? `Repository: ${args.repoDisplayName}` : null,
    `Issue: ${args.title}`,
    `URL: ${args.url}`,
    body ? `Issue body:\n${body}` : 'Issue body: (empty)',
    focus
      ? [
          '',
          'Focus thread comment:',
          `Author: @${focus.author}`,
          focusLoc ? `Location: ${focusLoc}` : null,
          focus.createdAt ? `When: ${focus.createdAt}` : null,
          focusBody ? `Comment:\n${focusBody}` : 'Comment: (empty)'
        ]
          .filter((line): line is string => line !== null)
          .join('\n')
      : null,
    '',
    'Task:',
    focus
      ? '1. Read the focused thread comment and the surrounding issue context.'
      : '1. Inspect the current worktree and issue context.',
    focus
      ? '2. Produce a concrete plan that answers or resolves that thread.'
      : '2. Produce a concrete implementation plan to solve this issue.',
    '3. Keep the plan actionable: goals, steps, files likely to change, risks, and verification.',
    `4. Post the plan as a comment on the issue using: ${commentCommand}`,
    focus ? '   Mention the focused author with @ and quote the key concern briefly.' : null,
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
    repoDisplayName: args.repo.displayName,
    focusComment: args.issue.focusComment
  })

  // Why: planning should not yank focus into a new terminal tab — run as a
  // background session (same pattern as "Work in background") so the user
  // stays on the issue and just sees a toast + eventual plan comment.
  try {
    const result = await launchAgentBackgroundSession({
      agent,
      worktreeId: args.worktreeId,
      prompt,
      launchSource: 'sidebar',
      title: translate(
        'auto.components.right.sidebar.issuesPanel.aiPlanTabTitle',
        'AI plan · #{{value0}}',
        { value0: args.issue.number }
      )
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
  } catch (err) {
    toast.error(
      err instanceof Error
        ? err.message
        : translate(
            'auto.components.right.sidebar.issuesPanel.agentLaunchFailed',
            'Failed to launch AI planner for this issue.'
          )
    )
    return false
  }

  toast.success(
    translate(
      'auto.components.right.sidebar.issuesPanel.aiPlanStartedBackground',
      'AI is drafting a plan comment on #{{value0}} in the background.',
      { value0: args.issue.number }
    )
  )
  return true
}
