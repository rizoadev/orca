/** Per-repo Linear binding: which workspace/project the Issues tab reads. */

export type LinearRepoBinding = {
  /** Concrete Linear workspace id (never the `all` selector). */
  workspaceId: string
  workspaceName?: string
  projectId: string
  projectName?: string
}
