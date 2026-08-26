// Why: Circle's filter/board UI needs projects, cycles, labels, users, statuses
// and comments to render. orca stores all of that implicitly inside orchestration
// tasks (project_id, pipeline_id, label comments, terminal handles, task status),
// so this module derives those resource lists straight from the Orca DB — no
// relational model to keep in sync. It also hosts the shared PM DTO types and
// status maps so the router and this module agree on the wire contract.
import type { OrchestrationDb } from '../runtime/orchestration/db'
import type {
  TaskCommentKind,
  TaskPriority,
  TaskRow,
  TaskStatus
} from '../runtime/orchestration/types'

export type PmStatusId = 'todo' | 'in-progress' | 'blocked' | 'done' | 'canceled'

export const STATUS_TO_PM: Record<TaskStatus, PmStatusId> = {
  pending: 'todo',
  ready: 'todo',
  dispatched: 'in-progress',
  blocked: 'blocked',
  completed: 'done',
  failed: 'canceled'
}

export const PM_TO_STATUS: Record<PmStatusId, TaskStatus> = {
  todo: 'ready',
  'in-progress': 'dispatched',
  blocked: 'blocked',
  done: 'completed',
  canceled: 'failed'
}

/** Circle/Linear-style Issue shape served over REST; derived from a TaskRow. */
export type PmIssue = {
  id: string
  title: string
  description: string
  status: PmStatusId
  priority: TaskPriority | 'none'
  projectId: string | null
  assignee: string | null
  cycleId: string | null
  parentId: string | null
  labels: string[]
  commentsCount: number
  createdAt: string
  completedAt: string | null
  /** Orca pipeline root id (the agent-execution group this issue belongs to). */
  pipelineId: string | null
  /** Live orchestration status — lets the UI badge real agent progress. */
  orcaStatus: TaskStatus
}

export function taskToIssue(db: OrchestrationDb, task: TaskRow): PmIssue {
  const comments = db.listTaskComments(task.id)
  const labels = comments
    .filter((c) => c.kind === 'system' && c.body.startsWith('label:'))
    .map((c) => c.body.slice('label:'.length))
  return {
    id: task.id,
    title: task.task_title ?? task.display_name ?? '(untitled)',
    description: task.spec,
    status: STATUS_TO_PM[task.status] ?? 'todo',
    priority: task.priority ?? 'none',
    projectId: task.project_id,
    assignee: task.created_by_terminal_handle,
    cycleId: task.pipeline_id === task.id ? null : task.pipeline_id,
    parentId: task.parent_id,
    labels,
    commentsCount: comments.length,
    createdAt: task.created_at,
    completedAt: task.completed_at,
    pipelineId: task.pipeline_id,
    orcaStatus: task.status
  }
}

export type PmResourceItem = { id: string; name: string; count: number }

function tallyPairs(pairs: string[]): PmResourceItem[] {
  const counts = new Map<string, number>()
  for (const value of pairs) {
    if (!value) {
      continue
    }
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, name: id, count }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function listProjects(db: OrchestrationDb): PmResourceItem[] {
  return tallyPairs(
    db
      .listTasks()
      .map((t) => t.project_id)
      .filter((p): p is string => Boolean(p))
  )
}

export function listCycles(db: OrchestrationDb): PmResourceItem[] {
  // Why: a task whose pipeline_id equals its own id is a pipeline root, not a cycle.
  return tallyPairs(
    db.listTasks().map((t) => (t.pipeline_id && t.pipeline_id !== t.id ? t.pipeline_id : ''))
  )
}

export function listLabels(db: OrchestrationDb): PmResourceItem[] {
  const labels: string[] = []
  for (const t of db.listTasks()) {
    for (const c of db.listTaskComments(t.id)) {
      if (c.kind === 'system' && c.body.startsWith('label:')) {
        labels.push(c.body.slice('label:'.length))
      }
    }
  }
  return tallyPairs(labels)
}

export function listUsers(db: OrchestrationDb): PmResourceItem[] {
  const handles: string[] = []
  // Why: assignees come from the real execution surface — who created the task
  // and who is/was dispatched to run it (agents are the assignees here).
  for (const row of db.listTasksWithDispatch()) {
    handles.push(row.created_by_terminal_handle ?? '', row.assignee_handle ?? '')
  }
  for (const t of db.listTasks()) {
    for (const c of db.listTaskComments(t.id)) {
      if (c.kind !== 'system') {
        handles.push(c.author)
      }
    }
  }
  return tallyPairs(handles)
}

export function listStatuses(db: OrchestrationDb): {
  id: PmStatusId
  name: string
  count: number
}[] {
  const counts = db.getTaskStatusCounts()
  return [
    { id: 'todo', name: 'Todo', count: counts.pending + counts.ready },
    { id: 'in-progress', name: 'In Progress', count: counts.dispatched },
    { id: 'blocked', name: 'Blocked', count: counts.blocked },
    { id: 'done', name: 'Done', count: counts.completed },
    { id: 'canceled', name: 'Canceled', count: counts.failed }
  ]
}

export type PmComment = {
  id: string
  author: string
  body: string
  kind: TaskCommentKind
  createdAt: string
}

export function listComments(db: OrchestrationDb, issueId: string): PmComment[] {
  return db
    .listTaskComments(issueId)
    .filter((c) => c.kind !== 'system')
    .map((c) => ({
      id: c.id,
      author: c.author,
      body: c.body,
      kind: c.kind,
      createdAt: c.created_at
    }))
}
