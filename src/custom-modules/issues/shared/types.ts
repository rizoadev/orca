/**
 * shared/types — barrel re-export for types used across issues module.
 * Resolves ../../../../shared/types from right-sidebar files.
 */
export type {
  GitHubWorkItem,
  GitHubWorkItemDetails
} from '../../../shared/github/work-items/work-item-types'
export type {
  GitLabWorkItem,
  GitLabWorkItemDetails,
  GitLabProjectRef
} from '../../../shared/gitlab/gitlab-types'
export type { LinearIssue } from '../../../shared/linear/issue-types'
export type { TuiAgent } from '../../../shared/agent-launch/catalog/tui-agent'
export type { Repo } from '../../../shared/repository/repo-types'
