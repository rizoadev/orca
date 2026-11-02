import type { GitHubWorkItem, GitLabWorkItem } from '../../../../shared/types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'

export type OpenIssueDetailsState = {
  provider: 'github' | 'gitlab'
  repoPath: string
  repoId: string | null
  sourceContext: TaskSourceContext | null
  githubItem?: GitHubWorkItem
  gitlabItem?: GitLabWorkItem
}

export function buildIssueDetailsTabId(
  worktreeId: string,
  provider: 'github' | 'gitlab',
  issueNumber: number,
  repoKey: string
): string {
  return `${worktreeId}::issue-details::${provider}::${repoKey}::${issueNumber}`
}

export function getIssueDetailsTabLabel(args: { number: number; title: string }): string {
  const title = args.title.trim()
  const short = title.length > 40 ? `${title.slice(0, 37)}…` : title
  return short ? `#${args.number} ${short}` : `#${args.number}`
}
