import { toast } from 'sonner'
import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { launchAgentInNewTabWithOutcome } from '@/lib/launch-agent-in-new-tab'
import { pickSourceControlLaunchAgent } from '../../../../../../shared/source-control-launch-agent-selection'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { Repo, TuiAgent } from '../../../../../../shared/types'
import type { RepoIssueProvider } from './repo-issue-provider'
import { issueRefLabel } from './issue-ref'

export type IssueAiWorkMode = 'background' | 'watch'

export type IssueAiWorkTarget = {
  provider: RepoIssueProvider
  number: number | null
  identifier?: string | null
  workspaceId?: string | null
  title: string
  url: string
  body?: string
}

export function buildIssueAiWorkPrompt(args: IssueAiWorkTarget & {
  repoDisplayName?: string
}): string {
  const providerLabel =
    args.provider === 'github' ? 'GitHub' : args.provider === 'gitlab' ? 'GitLab' : 'Linear'
  const refLabel = issueRefLabel({ number: args.number, identifier: args.identifier })
  const body = args.body?.trim()
  const closeCommand =
    args.provider === 'github'
      ? `gh issue close ${refLabel.replace(/^#/, '')}`
      : args.provider === 'gitlab'
        ? `glab issue close ${refLabel.replace(/^#/, '')}`
        : null

  return [
    `You are working on ${providerLabel} issue ${refLabel}.`,
    args.repoDisplayName ? `Repository: ${args.repoDisplayName}` : null,
    `Issue: ${args.title}`,
    `URL: ${args.url}`,
    body ? `Issue body:\n${body}` : 'Issue body: (empty)',
    '',
    'Task:',
    '1. Read the issue and inspect the relevant code in this worktree.',
    '2. Implement the fix or feature described by the issue.',
    '3. Run the focused tests/checks that cover your change; fix what you break.',
    '4. Summarize what changed: files, behavior, and how you verified it.',
    closeCommand
      ? `5. Only after the change is verified, close the issue with: ${closeCommand}`
      : '5. Only after the change is verified, report the outcome in the issue.',
    '6. If the request is ambiguous or blocked, stop and ask rather than guessing.'
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

export async function launchIssueAiWorker(args: {
  worktreeId: string
  repo: Repo
  agent: TuiAgent
  mode: IssueAiWorkMode
  issue: IssueAiWorkTarget
}): Promise<{ ok: boolean }> {
  const store = useAppStore.getState()
  const detected = args.repo.connectionId
    ? await store.ensureRemoteDetectedAgents(args.repo.connectionId)
    : await store.ensureDetectedAgents()
  const disabled = store.settings?.disabledTuiAgents ?? []
  const agent =
    detected.includes(args.agent) && !disabled.includes(args.agent)
      ? args.agent
      : pickSourceControlLaunchAgent({
          defaultAgent: store.settings?.defaultTuiAgent,
          detectedAgents: detected,
          disabledAgents: disabled
        })
  if (!agent) {
    toast.error(
      translate(
        'auto.components.right.sidebar.issuesPanel.noAgent',
        'No AI agent is available to plan this issue.'
      )
    )
    return { ok: false }
  }

  const prompt = buildIssueAiWorkPrompt({ ...args.issue, repoDisplayName: args.repo.displayName })
  const refLabel = issueRefLabel(args.issue)

  try {
    if (args.mode === 'watch') {
      const outcome = launchAgentInNewTabWithOutcome({
        agent,
        worktreeId: args.worktreeId,
        prompt,
        launchSource: 'sidebar'
      })
      if (!outcome || outcome.ok === false) {
        toast.error(
          translate(
            'auto.components.right.sidebar.issuesPanel.agentLaunchFailed',
            'Failed to launch AI planner for this issue.'
          )
        )
        return { ok: false }
      }
    } else {
      const result = await launchAgentBackgroundSession({
        agent,
        worktreeId: args.worktreeId,
        prompt,
        launchSource: 'sidebar',
        title: translate(
          'auto.components.right.sidebar.issuesPanel.aiWorkTabTitle',
          'AI work · {{value0}}',
          { value0: refLabel }
        )
      })
      if (!result) {
        toast.error(
          translate(
            'auto.components.right.sidebar.issuesPanel.agentLaunchFailed',
            'Failed to launch AI planner for this issue.'
          )
        )
        return { ok: false }
      }
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
    return { ok: false }
  }

  toast.success(
    translate(
      'auto.components.right.sidebar.issuesPanel.aiWorkStarted',
      'AI is working on {{value0}}.',
      { value0: refLabel }
    )
  )
  return { ok: true }
}
