// Stub — workspace actions (some lib deps not available yet)
import type { Repo } from '../../../../../../shared/repo-types'
import type { GitHubWorkItem } from '../../../../../../shared/github/work-item-types'
import type { GitLabWorkItem } from '../../../../../../shared/gitlab-types'
import type { LinearIssue } from '../../../../../../shared/linear/issue-types'

export function startGitHubIssueFromPanel(
  openModal: (modal: string, opts?: unknown) => void,
  _repo: Repo,
  item: GitHubWorkItem
): void {
  openModal('new-workspace-composer', { telemetrySource: 'issues-panel', githubItem: item })
}

export function startGitLabIssueFromPanel(
  openModal: (modal: string, opts?: unknown) => void,
  _repo: Repo,
  item: GitLabWorkItem
): void {
  openModal('new-workspace-composer', { telemetrySource: 'issues-panel', gitlabItem: item })
}

export function startLinearIssueFromPanel(
  openModal: (modal: string, opts?: unknown) => void,
  _repo: Repo,
  item: LinearIssue
): void {
  openModal('new-workspace-composer', { telemetrySource: 'issues-panel', linearItem: item })
}
