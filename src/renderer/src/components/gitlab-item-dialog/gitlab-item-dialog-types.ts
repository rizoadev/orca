import type { ReactNode } from 'react'
import type { GitLabWorkItem } from '../../../../shared/gitlab/gitlab-types'
import type { TaskSourceContext } from '../../../../shared/work-items/task-source-context'

export type GitLabItemDialogProps = {
  item: GitLabWorkItem | null
  repoPath: string | null
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
  onClose: () => void
  onCreateWorkspace?: (item: GitLabWorkItem) => void
  /** Trailing control slot rendered on the dialog's tab bar (custom-modules). */
  tabBarTrailingSlot?: ReactNode
  /** Opens the work item in the main editor view instead of the composer (custom-modules). */
  onOpenInMainView?: (item: GitLabWorkItem) => void
  /** Presentation context for the dialog chrome (custom-modules). */
  presentation?: string
  /** Hides the footer's external provider actions, e.g. for pure issues (custom-modules). */
  hideFooterExternalActions?: boolean
}

export type GitLabDialogRepoSelector = {
  repoPath: string
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
  repoOwnerExecutionHostId?: string
}
