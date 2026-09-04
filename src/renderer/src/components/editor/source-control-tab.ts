/** One main-box Source Control slot per worktree — re-opening replaces this tab (mirrors the orchestration-task pattern). */
export function buildSourceControlTabId(worktreeId: string): string {
  return `${worktreeId}::source-control`
}

export function isSourceControlTabId(fileId: string, worktreeId: string): boolean {
  return fileId === buildSourceControlTabId(worktreeId)
}
