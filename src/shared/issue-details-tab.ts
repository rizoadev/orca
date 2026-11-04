import type { GitHubWorkItem } from './github/work-item-types'
import type { GitLabWorkItem } from './gitlab-types'
import type { TaskSourceContext } from './task-source-context'

/** State behind a virtual main-view issue-detail tab (no file on disk). */
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
