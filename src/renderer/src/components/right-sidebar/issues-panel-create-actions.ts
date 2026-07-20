import { toast } from 'sonner'
import type { GitHubWorkItem, GitLabWorkItem, Repo } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import type { CreateIssueSubmitInput } from './issues-panel-create-dialog'
import { getRepoIssueSourceContext } from './issues-panel-rows'
import type { RepoIssueProvider } from './repo-issue-provider'

export type CreatedIssueResult =
  | { provider: 'github'; item: GitHubWorkItem }
  | { provider: 'gitlab'; item: GitLabWorkItem }

export async function createRepoIssue(args: {
  provider: RepoIssueProvider
  repo: Repo
  input: CreateIssueSubmitInput
}): Promise<CreatedIssueResult | null> {
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
