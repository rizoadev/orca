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
  parent_id?: string | null
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

export type OrchestrationBoardColumnId = 'ready' | 'dispatched' | 'blocked' | 'completed' | 'failed'

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

export type OrchestrationStatusTone =
  | 'ready'
  | 'pending'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'blocked'

// Why: shared status chip tone so table, gantt, and kanban read as one design.
export const ORCHESTRATION_STATUS_TONE: Record<OrchestrationStatusTone, string> = {
  ready: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
  pending: 'bg-muted text-muted-foreground border-border',
  dispatched: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  failed: 'bg-destructive/15 text-destructive border-destructive/30',
  blocked: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30'
}

export function orchestrationStatusTone(status: string | null | undefined): string {
  const key = (status ?? 'pending') as OrchestrationStatusTone
  return ORCHESTRATION_STATUS_TONE[key] ?? ORCHESTRATION_STATUS_TONE.pending
}

export function taskBoardLabel(task: OrchestrationBoardTask): string {
  // Why: RPC/DB rows can omit title/spec after stop/retry races; never throw in list rows.
  const label =
    task.display_name?.trim() ||
    task.task_title?.trim() ||
    (typeof task.spec === 'string' ? task.spec : '') ||
    task.id ||
    'Task'
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
