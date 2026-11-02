import { toast } from 'sonner'
import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { pickSourceControlLaunchAgent } from '../../../../../../shared/source-control-launch-agent-selection'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { Repo, TuiAgent } from '../../../../../../shared/types'
import type { RepoIssueProvider } from './repo-issue-provider'
import { issueRefLabel } from './issue-ref'

export type IssuePlanCommentTarget = {
  provider: RepoIssueProvider
  number: number | null
  /** Linear identifier (ENG-123); omit for github/gitlab. */
  identifier?: string | null
  title: string
  url: string
  body?: string
}

export function buildIssueAiPlanPrompt(args: {
  provider: RepoIssueProvider
  number: number | null
  identifier?: string | null
  title: string
  url: string
  body?: string
  repoDisplayName?: string
}): string {
  const providerLabel =
    args.provider === 'github' ? 'GitHub' : args.provider === 'gitlab' ? 'GitLab' : 'Linear'
  const refLabel = issueRefLabel({ number: args.number, identifier: args.identifier })
  const body = args.body?.trim()
  const commentCommand =
    args.provider === 'github'
      ? `gh issue comment ${refLabel.replace(/^#/, '')} --body "...plan..."`
      : args.provider === 'gitlab'
        ? `glab issue note ${refLabel.replace(/^#/, '')} --message "...plan..."`
        : `orca linear comment add ${refLabel} --body "...plan..."`

  return [
    `You are attached as a planning commenter on ${providerLabel} issue ${refLabel}.`,
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
  const agent =
    preferred ??
    pickSourceControlLaunchAgent({
      defaultAgent: store.settings?.defaultTuiAgent,
      detectedAgents: detected,
      disabledAgents: store.settings?.disabledTuiAgents
    })
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
    identifier: args.issue.identifier,
    title: args.issue.title,
    url: args.issue.url,
    body: args.issue.body,
    repoDisplayName: args.repo.displayName
  })

  try {
    const result = await launchAgentBackgroundSession({
      agent,
      worktreeId: args.worktreeId,
      prompt,
      launchSource: 'sidebar',
      title: translate(
        'auto.components.right.sidebar.issuesPanel.aiPlanTabTitle',
        'AI plan · {{value0}}',
        { value0: issueRefLabel(args.issue) }
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
      'AI is drafting a plan comment on {{value0}} in the background.',
      { value0: issueRefLabel(args.issue) }
    )
  )
  return true
}
