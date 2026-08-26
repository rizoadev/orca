import { ipcMain } from 'electron'
import type { OrchestrationDb } from '../runtime/orchestration/db'
import { spawnTaskAgent } from '../services/task-orchestration'
import {
  TASK_ORCHESTRATION_IPC,
  type TaskOrchestrationSpawnRequest
} from '../../shared/task-orchestration-types'

export function registerTaskOrchestrationHandlers(db: OrchestrationDb): void {
  ipcMain.handle(TASK_ORCHESTRATION_IPC.spawn, (_event, req: TaskOrchestrationSpawnRequest) => {
    return spawnTaskAgent(db, req)
  })
}
