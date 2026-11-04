import type React from 'react'
import type { GitLabWorkItem } from '../../../../shared/gitlab-types'
import type { TaskSourceContext } from '../../../../shared/task-source-context'

export type GitLabItemDialogProps = {
  item: GitLabWorkItem | null
  repoPath: string | null
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
  onClose: () => void
  onCreateWorkspace?: (item: GitLabWorkItem) => void
  /** Header action row (issue AI bar); rendered above the tabs. */
  tabBarTrailingSlot?: React.ReactNode
  /** Kept for callers that render the dialog as a modal. */
  presentation?: 'modal' | 'sheet'
  /** Hides the footer's external-provider actions for issues. */
  hideFooterExternalActions?: boolean
  /** Opens the item in the main view instead of a modal. */
  onOpenInMainView?: (item: GitLabWorkItem) => void
}

export type GitLabDialogRepoSelector = {
  repoPath: string
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
  repoOwnerExecutionHostId?: string
}
