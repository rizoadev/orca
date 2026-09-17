import { toast } from 'sonner'
import type { GitHubWorkItem, GitLabWorkItem, LinearIssue, Repo } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import {
  linearCreateIssue,
  linearListTeams,
  linearTeamStates,
  linearUpdateIssue
} from '@/runtime/runtime-linear-client'
import type { CreateIssueSubmitInput } from './issues-panel-create-dialog'
import { getRepoIssueSourceContext, type IssueRow } from './issues-panel-rows'
import type { RepoIssueProvider } from './repo-issue-provider'

export type CreatedIssueResult =
  | { provider: 'github'; item: GitHubWorkItem }
  | { provider: 'gitlab'; item: GitLabWorkItem }
  | { provider: 'linear'; item: LinearIssue }

async function createLinearIssue(args: {
  repo: Repo
  input: CreateIssueSubmitInput
  binding: { workspaceId: string; projectId: string; projectName?: string }
}): Promise<CreatedIssueResult | null> {
  const settings = getRepoIssueSourceContext(args.repo, 'linear') ?? null
  // Why: the panel keeps the GitHub/GitLab title+body form, so Linear needs a
  // team resolved for it — prefer the attached project's team, else the first
  // team in the bound workspace.
  const teams = await linearListTeams(settings, args.binding.workspaceId).catch(() => [])
  const team = teams[0]
  if (!team) {
    toast.error(
      translate(
        'auto.components.right.sidebar.issuesPanel.linearNoTeam',
        'No Linear team is available in the attached workspace.'
      )
    )
    return null
  }
  const result = await linearCreateIssue(settings, {
    teamId: team.id,
    title: args.input.title,
    description: args.input.body || undefined,
    workspaceId: args.binding.workspaceId,
    projectId: args.binding.projectId
  })
  if (!result.ok) {
    toast.error(
      result.error ||
        translate(
          'auto.components.right.sidebar.issuesPanel.createFailed',
          'Failed to create issue.'
        )
    )
    return null
  }
  toast.success(
    translate('auto.components.right.sidebar.issuesPanel.createdLinear', 'Created {{value0}}', {
      value0: result.identifier
    })
  )
  return {
    provider: 'linear',
    item: {
      id: result.id,
      identifier: result.identifier,
      title: args.input.title,
      url: result.url,
      description: args.input.body || undefined,
      workspaceId: args.binding.workspaceId,
      state: { name: '', type: '', color: '' },
      team: { id: team.id, name: team.name, key: team.key ?? '' },
      labels: [],
      labelIds: [],
      priority: 0,
      updatedAt: new Date().toISOString()
    }
  }
}

export async function createRepoIssue(args: {
  provider: RepoIssueProvider
  repo: Repo
  input: CreateIssueSubmitInput
  /** Required for Linear: the attached project drives team/project on create. */
  linearBinding?: { workspaceId: string; projectId: string; projectName?: string } | null
}): Promise<CreatedIssueResult | null> {
  if (args.provider === 'linear') {
    if (!args.linearBinding) {
      toast.error(
        translate(
          'auto.components.right.sidebar.issuesPanel.linearAttachFirst',
          'Attach a Linear project before creating issues.'
        )
      )
      return null
    }
    return createLinearIssue({
      repo: args.repo,
      input: args.input,
      binding: args.linearBinding
    })
  }

  if (args.provider === 'github') {
    const result = await window.api.gh.createIssue({
      repoPath: args.repo.path,
      repoId: args.repo.id,
      sourceContext: getRepoIssueSourceContext(args.repo, 'github'),
      title: args.input.title,
      body: args.input.body
    })
    if (!result.ok) {
      toast.error(
        result.error ||
          translate(
            'auto.components.right.sidebar.issuesPanel.createFailed',
            'Failed to create issue.'
          )
      )
      return null
    }
    toast.success(
      translate('auto.components.right.sidebar.issuesPanel.created', 'Opened issue #{{value0}}', {
        value0: result.number
      })
    )
    return {
      provider: 'github',
      item: {
        id: `issue:${String(result.number)}`,
        repoId: args.repo.id,
        type: 'issue',
        number: result.number,
        title: args.input.title,
        state: 'open',
        url: result.url,
        labels: [],
        updatedAt: new Date().toISOString(),
        author: null
      }
    }
  }

  const result = await window.api.gl.createIssue({
    repoPath: args.repo.path,
    repoId: args.repo.id,
    sourceContext: getRepoIssueSourceContext(args.repo, 'gitlab'),
    title: args.input.title,
    body: args.input.body
  })
  if (!result.ok) {
    toast.error(
      result.error ||
        translate(
          'auto.components.right.sidebar.issuesPanel.createFailed',
          'Failed to create issue.'
        )
    )
    return null
  }
  toast.success(
    translate('auto.components.right.sidebar.issuesPanel.created', 'Opened issue #{{value0}}', {
      value0: result.number
    })
  )
  return {
    provider: 'gitlab',
    item: {
      id: `gitlab-issue-${args.repo.id}-${result.number}`,
      type: 'issue',
      number: result.number,
      title: args.input.title,
      state: 'opened',
      url: result.url,
      labels: [],
      updatedAt: new Date().toISOString(),
      author: null,
      repoId: args.repo.id
    }
  }
}

async function closeLinearIssue(args: { repo: Repo; issue: LinearIssue }): Promise<boolean> {
  const settings = getRepoIssueSourceContext(args.repo, 'linear') ?? null
  const teamId = args.issue.team?.id
  if (!teamId) {
    toast.error(
      translate('auto.components.right.sidebar.issuesPanel.closeFailed', 'Failed to close issue.')
    )
    return false
  }
  const states = await linearTeamStates(settings, teamId, args.issue.workspaceId).catch(() => [])
  const completed =
    states.find((state) => state.type === 'completed') ??
    states.find((state) => state.type === 'canceled')
  if (!completed) {
    toast.error(
      translate(
        'auto.components.right.sidebar.issuesPanel.linearNoCompletedState',
        'No completed state is available for this Linear team.'
      )
    )
    return false
  }
  const result = await linearUpdateIssue(
    settings,
    args.issue.id,
    { stateId: completed.id },
    args.issue.workspaceId
  )
  if (!result.ok) {
    toast.error(
      result.error ||
        translate('auto.components.right.sidebar.issuesPanel.closeFailed', 'Failed to close issue.')
    )
    return false
  }
  return true
}

export async function closeRepoIssue(args: { repo: Repo; row: IssueRow }): Promise<boolean> {
  if (args.row.provider === 'linear') {
    if (!args.row.linearItem) {
      return false
    }
    const ok = await closeLinearIssue({ repo: args.repo, issue: args.row.linearItem })
    if (!ok) {
      return false
    }
  } else if (args.row.provider === 'github') {
    const result = await window.api.gh.updateIssue({
      repoPath: args.repo.path,
      repoId: args.repo.id,
      sourceContext: getRepoIssueSourceContext(args.repo, 'github'),
      number: args.row.number ?? 0,
      updates: { state: 'closed' }
    })
    if (!result.ok) {
      toast.error(
        result.error ||
          translate(
            'auto.components.right.sidebar.issuesPanel.closeFailed',
            'Failed to close issue.'
          )
      )
      return false
    }
  } else {
    const result = await window.api.gl.updateIssue({
      repoPath: args.repo.path,
      repoId: args.repo.id,
      sourceContext: getRepoIssueSourceContext(args.repo, 'gitlab'),
      number: args.row.number ?? 0,
      updates: { state: 'closed' }
    })
    if (!result.ok) {
      toast.error(
        result.error ||
          translate(
            'auto.components.right.sidebar.issuesPanel.closeFailed',
            'Failed to close issue.'
          )
      )
      return false
    }
  }

  toast.success(
    translate('auto.components.right.sidebar.issuesPanel.closed', 'Closed issue {{value0}}', {
      value0: args.row.label
    })
  )
  return true
}
