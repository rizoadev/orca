export type OrchestrationBoardTaskStatus =
  | 'pending'
  | 'ready'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'blocked'

export type OrchestrationBoardTaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export type OrchestrationBoardTask = {
  id: string
  spec: string
  task_title?: string | null
  display_name?: string | null
  status: OrchestrationBoardTaskStatus
  priority?: OrchestrationBoardTaskPriority | string | null
  repo_id?: string | null
  project_id?: string | null
  worktree_id?: string | null
  host_id?: string | null
  pipeline_id?: string | null
  pipeline_stage?: string | null
  pipeline_role?: string | null
  pipeline_attempt?: number | null
  assignee_handle?: string | null
  dispatch_id?: string | null
  created_at?: string
  completed_at?: string | null
  result?: string | null
}

export type OrchestrationBoardComment = {
  id: string
  task_id: string
  author: string
  role: string | null
  kind: 'comment' | 'result' | 'system' | 'dispatch'
  body: string
  parent_id: string | null
  created_at: string
}

export type OrchestrationBoardRosterRow = {
  taskId: string
  stage: string | null
  role: string | null
  status: string
  title: string | null
  assignee: string | null
  dispatchStatus: string | null
  attempt: number | null
}

export type OrchestrationBoardInCharge = {
  handle: string | null
  role: string | null
  status: string
  dispatchId: string | null
}

export type OrchestrationBoardColumnId =
  | 'ready'
  | 'dispatched'
  | 'blocked'
  | 'completed'
  | 'failed'

export const ORCHESTRATION_BOARD_COLUMNS: {
  id: OrchestrationBoardColumnId
  title: string
  statuses: OrchestrationBoardTaskStatus[]
}[] = [
  { id: 'ready', title: 'Ready', statuses: ['ready', 'pending'] },
  { id: 'dispatched', title: 'In progress', statuses: ['dispatched'] },
  { id: 'blocked', title: 'Blocked', statuses: ['blocked'] },
  { id: 'completed', title: 'Done', statuses: ['completed'] },
  { id: 'failed', title: 'Failed', statuses: ['failed'] }
]

export function taskBoardLabel(task: OrchestrationBoardTask): string {
  const label = task.display_name?.trim() || task.task_title?.trim() || task.spec
  return label.replace(/\s+/g, ' ').trim()
}

export function columnForTaskStatus(
  status: OrchestrationBoardTaskStatus
): OrchestrationBoardColumnId {
  for (const column of ORCHESTRATION_BOARD_COLUMNS) {
    if (column.statuses.includes(status)) {
      return column.id
    }
  }
  return 'ready'
}

export function groupTasksByColumn(
  tasks: readonly OrchestrationBoardTask[]
): Record<OrchestrationBoardColumnId, OrchestrationBoardTask[]> {
  const groups: Record<OrchestrationBoardColumnId, OrchestrationBoardTask[]> = {
    ready: [],
    dispatched: [],
    blocked: [],
    completed: [],
    failed: []
  }
  for (const task of tasks) {
    groups[columnForTaskStatus(task.status)].push(task)
  }
  return groups
}

export function priorityTone(
  priority: OrchestrationBoardTask['priority']
): 'muted' | 'default' | 'warn' | 'danger' {
  switch (priority) {
    case 'urgent':
      return 'danger'
    case 'high':
      return 'warn'
    case 'low':
      return 'muted'
    default:
      return 'default'
  }
}

export function shortWorktreeLabel(worktreeId: string | null | undefined): string | null {
  if (!worktreeId) {
    return null
  }
  const sep = worktreeId.indexOf('::')
  const path = sep === -1 ? worktreeId : worktreeId.slice(sep + 2)
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts.at(-1) ?? path
}
