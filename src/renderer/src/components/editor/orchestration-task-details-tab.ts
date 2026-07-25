import type { OrchestrationBoardTask } from '@/components/orchestration-board/orchestration-board-model'

export type OpenOrchestrationTaskDetailsState = {
  task: OrchestrationBoardTask
}

/** One main-box orchestration detail slot per worktree — switching tasks replaces this tab. */
export function buildOrchestrationTaskDetailsTabId(worktreeId: string, _taskId?: string): string {
  return `${worktreeId}::orchestration-task`
}

export function isOrchestrationTaskDetailsTabId(fileId: string, worktreeId: string): boolean {
  return fileId === buildOrchestrationTaskDetailsTabId(worktreeId)
}

export function getOrchestrationTaskDetailsTabLabel(task: {
  display_name?: string | null
  task_title?: string | null
  id: string
}): string {
  const label = task.display_name?.trim() || task.task_title?.trim() || task.id
  return label.replace(/\s+/g, ' ').slice(0, 48)
}
