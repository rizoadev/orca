// Why: Circle is a pure front-end (mock data). To make it a real PM UI backed
// by orca's orchestration runtime, this REST resource layer reads/writes the
// Orca OrchestrationDb directly — no mock data, no dual source of truth.
// Each REST resource maps 1:1 onto orca's task model:
//   Issue   → TaskRow (title → task_title, description → spec, project → project_id,
//             assignee → created_by_terminal_handle, cycle → pipeline_id, order → created_at)
//   Comment → task_comments row
//   Status  → orca TaskStatus (pending/ready → todo, dispatched → in-progress,
//             blocked → blocked, completed → done, failed → canceled)
//   Project / Cycle / Label / User → derived from tasks + comments so the UI
//   can render filters without orca duplicating Circle's relational model.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { OrchestrationDb } from '../runtime/orchestration/db'
import type { TaskPriority } from '../runtime/orchestration/types'
import {
  PM_TO_STATUS,
  taskToIssue,
  listComments,
  listCycles,
  listLabels,
  listProjects,
  listStatuses,
  listUsers
} from './pm-rest-resources'
import type { PmIssue, PmStatusId } from './pm-rest-resources'

const PM_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high', 'urgent']

function pmPriorityToOrca(priority: string | undefined): TaskPriority | undefined {
  if (priority && (PM_PRIORITIES as readonly string[]).includes(priority)) {
    return priority as TaskPriority
  }
  return undefined
}

// ── JSON helpers ─────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 1_000_000

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }
}

function pmSendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json', ...corsHeaders() })
  res.end(JSON.stringify(body))
}

function pmReadJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

// ── Issue CRUD ───────────────────────────────────────────────────────────────

type IssueBody = {
  title?: string
  description?: string
  status?: PmStatusId
  priority?: string
  projectId?: string | null
  assignee?: string | null
  cycleId?: string | null
  parentId?: string | null
  labels?: string[]
}

function listIssues(db: OrchestrationDb, params: URLSearchParams): PmIssue[] {
  const status = params.get('status')
  const projectId = params.get('projectId')
  const assignee = params.get('assignee')
  const priority = params.get('priority')
  const tasks = db.listTasks({
    status: status ? PM_TO_STATUS[status as PmStatusId] : undefined,
    projectId: projectId ?? undefined,
    priority: priority ? pmPriorityToOrca(priority) : undefined
  })
  // Why: only surface top-level issues as board cards; children (research/implement/
  // test/review) stay as subtasks under their pipeline root.
  return tasks
    .filter((t) => !t.parent_id)
    .map((t) => taskToIssue(db, t))
    .filter((i) => (assignee ? i.assignee === assignee : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function createIssue(db: OrchestrationDb, body: IssueBody): PmIssue | null {
  const title = body.title?.trim()
  if (!title) {
    return null
  }
  const task = db.createTask({
    spec: body.description?.trim() || title,
    taskTitle: title,
    parentId: body.parentId?.trim() || undefined,
    createdByTerminalHandle: body.assignee?.trim() || undefined,
    priority: pmPriorityToOrca(body.priority),
    projectId: body.projectId?.trim() || undefined,
    pipelineId: body.cycleId?.trim() || undefined
  })
  for (const label of body.labels ?? []) {
    const name = label.trim()
    if (name) {
      db.addTaskComment({
        taskId: task.id,
        author: 'system',
        body: `label:${name}`,
        kind: 'system'
      })
    }
  }
  return taskToIssue(db, task)
}

function replaceLabels(db: OrchestrationDb, taskId: string, labels: string[]): void {
  const existing = db
    .listTaskComments(taskId)
    .filter((c) => c.kind === 'system' && c.body.startsWith('label:'))
  const next = new Set(labels.map((l) => l.trim()).filter(Boolean))
  for (const row of existing) {
    if (!next.has(row.body.slice('label:'.length))) {
      db.deleteTaskComment(row.id)
    }
  }
  const have = new Set(existing.map((c) => c.body.slice('label:'.length)))
  for (const added of next) {
    if (!have.has(added)) {
      db.addTaskComment({ taskId, author: 'system', body: `label:${added}`, kind: 'system' })
    }
  }
}

function updateIssue(db: OrchestrationDb, id: string, body: IssueBody): PmIssue | null {
  const task = db.getTask(id)
  if (!task) {
    return null
  }
  const title = body.title?.trim()
  const nextSpec = body.description?.trim()
  if (title !== undefined || nextSpec !== undefined) {
    db.updateTaskContent(id, {
      title: title ?? task.task_title ?? '',
      spec: nextSpec ?? task.spec
    })
  }
  if (body.priority !== undefined || body.projectId !== undefined) {
    db.updateTaskScope(id, {
      priority: pmPriorityToOrca(body.priority),
      projectId: body.projectId?.trim() || null
    })
  }
  if (body.status !== undefined) {
    const next = PM_TO_STATUS[body.status]
    if (next) {
      db.updateTaskStatus(id, next)
    }
  }
  if (body.cycleId !== undefined) {
    db.setTaskPipelineMeta(id, { pipelineId: body.cycleId?.trim() || null })
  }
  if (body.labels !== undefined) {
    replaceLabels(db, id, body.labels)
  }
  const updated = db.getTask(id)
  return updated ? taskToIssue(db, updated) : null
}

// ── Router ───────────────────────────────────────────────────────────────────

function jsonError(res: ServerResponse, code: number, message: string): void {
  pmSendJson(res, code, { error: message })
}

/**
 * Handle a PM REST request. Returns true when the path was handled by this
 * layer; false when the caller should fall through (404 / task-orchestration).
 */
export async function handlePmRestRequest(
  db: OrchestrationDb,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  const { pathname: path, searchParams } = url
  const method = req.method ?? 'GET'

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders())
    res.end()
    return true
  }

  const issueMatch = path.match(/^\/issues(?:\/([^/]+))?$/)
  if (issueMatch) {
    const id = issueMatch[1]
    if (!id && method === 'GET') {
      pmSendJson(res, 200, listIssues(db, searchParams))
      return true
    }
    if (!id && method === 'POST') {
      const body = (await pmReadJson(req)) as IssueBody
      const issue = createIssue(db, body)
      if (!issue) {
        jsonError(res, 400, 'title is required')
        return true
      }
      pmSendJson(res, 201, issue)
      return true
    }
    if (id && method === 'GET') {
      const issue = db.getTask(id)
      if (!issue) {
        jsonError(res, 404, 'not found')
        return true
      }
      pmSendJson(res, 200, taskToIssue(db, issue))
      return true
    }
    if (id && method === 'PATCH') {
      const body = (await pmReadJson(req)) as IssueBody
      const issue = updateIssue(db, id, body)
      if (!issue) {
        jsonError(res, 404, 'not found')
        return true
      }
      pmSendJson(res, 200, issue)
      return true
    }
    if (id && method === 'DELETE') {
      const deleted = db.deleteTask(id)
      if (!deleted) {
        jsonError(res, 404, 'not found')
        return true
      }
      pmSendJson(res, 200, { deleted: deleted.deletedIds })
      return true
    }
  }

  const commentsMatch = path.match(/^\/issues\/([^/]+)\/comments$/)
  if (commentsMatch && method === 'GET') {
    if (!db.getTask(commentsMatch[1]!)) {
      jsonError(res, 404, 'not found')
      return true
    }
    pmSendJson(res, 200, listComments(db, commentsMatch[1]!))
    return true
  }

  if (method === 'GET' && path === '/projects') {
    pmSendJson(res, 200, listProjects(db))
    return true
  }
  if (method === 'GET' && path === '/cycles') {
    pmSendJson(res, 200, listCycles(db))
    return true
  }
  if (method === 'GET' && path === '/labels') {
    pmSendJson(res, 200, listLabels(db))
    return true
  }
  if (method === 'GET' && path === '/users') {
    pmSendJson(res, 200, listUsers(db))
    return true
  }
  if (method === 'GET' && path === '/statuses') {
    pmSendJson(res, 200, listStatuses(db))
    return true
  }

  return false
}
