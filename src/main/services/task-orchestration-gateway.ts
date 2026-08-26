// Why: Circle (or any PM UI) runs in a browser and cannot reach Electron IPC,
// so it cannot call `task-orchestration:spawn` directly. This small localhost
// HTTP gateway exposes the task-orchestration service (spawn + status polling)
// so a PM board can push tasks to orca and reflect live agent progress.
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { OrchestrationDb } from '../runtime/orchestration/db'
import { spawnTaskAgent } from './task-orchestration'
import { handlePmRestRequest } from './pm-rest-service'
import type {
  TaskOrchestrationPhase,
  TaskOrchestrationSpawnRequest,
  TaskOrchestrationSpawnResult,
  TaskOrchestrationStatusResult
} from '../../shared/task-orchestration-types'

const DEFAULT_PORT = Number(process.env.ORCA_TASK_GATEWAY_PORT ?? 18789)
const MAX_BODY_BYTES = 1_000_000

export function phaseFor(status: string): TaskOrchestrationPhase {
  switch (status) {
    case 'completed':
      return 'done'
    case 'failed':
      return 'failed'
    case 'blocked':
      return 'blocked'
    case 'dispatched':
      return 'in-progress'
    default:
      return 'todo'
  }
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        return resolve({})
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

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }
}

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json', ...corsHeaders() })
  res.end(payload)
}

function statusResultFor(
  db: OrchestrationDb,
  taskId: string
): TaskOrchestrationStatusResult | null {
  const root = db.getTask(taskId)
  if (!root) {
    return null
  }
  const children = db.listTasksByPipeline(taskId).filter((c) => c.id !== taskId)
  let active = 0
  let completed = 0
  let failed = 0
  let blocked = 0
  for (const c of children) {
    if (c.status === 'dispatched') {
      active++
    } else if (c.status === 'completed') {
      completed++
    } else if (c.status === 'failed') {
      failed++
    } else if (c.status === 'blocked') {
      blocked++
    }
  }
  return {
    taskId,
    status: root.status,
    phase: phaseFor(root.status),
    subtasks: {
      total: children.length,
      active,
      completed,
      failed,
      blocked
    }
  }
}

export function startTaskOrchestrationGateway(db: OrchestrationDb): () => void {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const path = url.pathname

      // Why: Circle/PM resource paths (issues, projects, cycles, labels, users,
      // statuses, comments) are owned by the PM REST layer; everything else falls
      // through to the task-orchestration routes below.
      const handled = await handlePmRestRequest(db, req, res, url)
      if (handled) {
        return
      }

      // Why: Circle calls this from a browser on a different origin (:3000),
      // so the gateway must answer CORS preflight (OPTIONS) requests.
      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders())
        res.end()
        return
      }

      if (req.method === 'GET' && path === '/health') {
        return sendJson(res, 200, { ok: true })
      }

      if (req.method === 'POST' && path === '/task-orchestration/spawn') {
        const body = (await readJson(req)) as Partial<TaskOrchestrationSpawnRequest>
        if (typeof body.title !== 'string' || typeof body.spec !== 'string') {
          return sendJson(res, 400, { error: 'title and spec are required' })
        }
        const result: TaskOrchestrationSpawnResult = spawnTaskAgent(
          db,
          body as TaskOrchestrationSpawnRequest
        )
        return sendJson(res, 200, result)
      }

      if (req.method === 'GET' && path === '/task-orchestration/status') {
        const taskId = url.searchParams.get('taskId')
        if (!taskId) {
          return sendJson(res, 400, { error: 'taskId required' })
        }
        const status = statusResultFor(db, taskId)
        if (!status) {
          return sendJson(res, 404, { error: 'unknown task' })
        }
        return sendJson(res, 200, status)
      }

      sendJson(res, 404, { error: 'not found' })
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  })

  server.on('error', (err) => {
    // Why: the gateway is optional for orca itself. If the port is taken (e.g. a
    // second orca instance), keep the app running instead of crashing.
    console.warn('[task-orchestration-gateway] failed to start:', err.message)
  })

  server.listen(DEFAULT_PORT, '127.0.0.1', () => {
    console.log(`[task-orchestration-gateway] listening on 127.0.0.1:${DEFAULT_PORT}`)
  })

  return () => {
    server.close()
  }
}
