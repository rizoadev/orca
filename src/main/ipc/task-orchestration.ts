import { ipcMain } from 'electron'
import http from 'node:http'
import type { OrchestrationDb } from '../runtime/orchestration/db'
import { spawnTaskAgent } from '../services/task-orchestration'
import {
  TASK_ORCHESTRATION_IPC,
  type LinearRelayGatewayStatus,
  type LinearRelayRecentTask,
  type TaskOrchestrationSpawnRequest
} from '../../shared/task-orchestration-types'

function pingHttp(url: string, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const u = new URL(url)
      const isHttps = u.protocol === 'https:'
      const client = isHttps ? require('node:https') : http
      const req = client.request(
        url,
        { method: 'GET', timeout: timeoutMs, headers: { 'User-Agent': 'Orca-Ping' } },
        (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 500)
        }
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
      req.end()
    } catch {
      resolve(false)
    }
  })
}

export function registerTaskOrchestrationHandlers(db: OrchestrationDb): void {
  ipcMain.handle(TASK_ORCHESTRATION_IPC.spawn, (_event, req: TaskOrchestrationSpawnRequest) => {
    return spawnTaskAgent(db, req)
  })

  ipcMain.handle(
    TASK_ORCHESTRATION_IPC.getGatewayStatus,
    async (): Promise<LinearRelayGatewayStatus> => {
      const gatewayPort = 18789
      const relayUrl = 'https://linear-orca-relay.ikamaigb.workers.dev'
      const tunnelUrl = 'https://orca-87e96a66.ikamai.com/health'

      const [gatewayRunning, relayOnline, tunnelOnline] = await Promise.all([
        pingHttp(`http://127.0.0.1:${gatewayPort}/health`, 1500),
        pingHttp(relayUrl, 3000),
        pingHttp(tunnelUrl, 3000)
      ])

      return {
        gatewayPort,
        gatewayRunning,
        relayUrl,
        relayOnline,
        tunnelUrl: 'https://orca-87e96a66.ikamai.com',
        tunnelOnline,
        runnerRunning: gatewayRunning
      }
    }
  )

  ipcMain.handle(TASK_ORCHESTRATION_IPC.listRecentTasks, (): LinearRelayRecentTask[] => {
    try {
      const rows = db.listTasks()
      return rows
        .slice(-15)
        .toReversed()
        .map((r) => ({
          id: r.id,
          pipelineId: r.pipeline_id,
          title: r.task_title || r.display_name || 'Untitled Task',
          status: r.status,
          repoId: r.repo_id,
          createdAt: r.created_at || '',
          completedAt: r.completed_at || null,
          result: r.result || null
        }))
    } catch (err) {
      console.warn('[task-orchestration] listRecentTasks error:', err)
      return []
    }
  })
}
