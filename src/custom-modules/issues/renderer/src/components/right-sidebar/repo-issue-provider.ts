import type { Repo } from '../../../../../../shared/repo-types'

export type RepoIssueProvider = 'github' | 'gitlab' | 'linear'

/** Detect the most likely issue provider from the repo's remote URL. */
export function detectRepoIssueProvider(repo: Repo | null | undefined): RepoIssueProvider | null {
  if (!repo) {
    return null
  }
  const remote = repo.gitRemoteIdentity?.remoteUrl?.toLowerCase() ?? ''
  if (remote.includes('github.com')) {
    return 'github'
  }
  if (remote.includes('gitlab')) {
    return 'gitlab'
  }
  return null
}
