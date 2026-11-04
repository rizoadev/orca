/**
 * GitLab API access for the issues module: routes through the host holding the
 * repo's GitLab credentials (same as the Tasks page). Raw `gl` IPC rejects
 * repos it cannot resolve locally, e.g. remote-host worktrees.
 */
import { gitLabApiFor } from '@/runtime/gitlab-owner-api'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import type { Repo } from '../../../../shared/types'
import { getRepoIssueSourceContext } from './components/right-sidebar/issues-panel-rows'

export type GitLabModuleSelector = {
  repoPath: string
  repoId: string
  sourceContext: ReturnType<typeof getRepoIssueSourceContext>
  repoOwnerExecutionHostId: ReturnType<typeof getRepoExecutionHostId>
}

export function gitLabModuleSelector(repo: Repo): GitLabModuleSelector {
  return {
    repoPath: repo.path,
    repoId: repo.id,
    sourceContext: getRepoIssueSourceContext(repo, 'gitlab'),
    repoOwnerExecutionHostId: getRepoExecutionHostId(repo)
  }
}

export function gitLabModuleApi(repo: Repo) {
  return gitLabApiFor(gitLabModuleSelector(repo))
}
