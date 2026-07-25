/**
 * Electron IPC handlers for Asana task source.
 */
import { ipcMain } from 'electron'
import {
  connect,
  disconnect,
  ensureHydrated,
  selectWorkspace
} from '../asana/client'
import {
  createTask,
  getTask,
  listProjects,
  listSections,
  listTasks,
  updateTask
} from '../asana/tasks'
import type {
  AsanaConnectArgs,
  AsanaCreateTaskArgs,
  AsanaTaskFilter,
  AsanaTaskUpdate
} from '../../shared/asana-types'

const VALID_FILTERS = new Set<AsanaTaskFilter>(['assigned', 'all', 'completed'])

function clampLimit(value: unknown, fallback = 50): number {
  const limit = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(Math.max(1, limit), 100)
}

export function registerAsanaHandlers(): void {
  ipcMain.handle('asana:getStatus', async () => {
    return ensureHydrated()
  })

  ipcMain.handle('asana:connect', async (_event, args: AsanaConnectArgs) => {
    if (!args?.personalAccessToken?.trim()) {
      throw new Error('Personal Access Token is required.')
    }
    return connect(args)
  })

  ipcMain.handle('asana:disconnect', async () => {
    return disconnect()
  })

  ipcMain.handle('asana:selectWorkspace', async (_event, workspaceGid: string | null) => {
    return selectWorkspace(workspaceGid)
  })

  ipcMain.handle('asana:listProjects', async (_event, workspaceGid?: string) => {
    return listProjects(workspaceGid)
  })

  ipcMain.handle('asana:listSections', async (_event, projectGid: string) => {
    if (!projectGid) {
      throw new Error('projectGid is required.')
    }
    return listSections(projectGid)
  })

  ipcMain.handle(
    'asana:listTasks',
    async (
      _event,
      args: {
        projectGid?: string
        workspaceGid?: string
        filter?: AsanaTaskFilter
        limit?: number
      } = {}
    ) => {
      const filter =
        args.filter && VALID_FILTERS.has(args.filter) ? args.filter : ('assigned' as AsanaTaskFilter)
      return listTasks({
        projectGid: args.projectGid,
        workspaceGid: args.workspaceGid,
        filter,
        limit: clampLimit(args.limit)
      })
    }
  )

  ipcMain.handle('asana:getTask', async (_event, taskGid: string) => {
    if (!taskGid) {
      throw new Error('taskGid is required.')
    }
    return getTask(taskGid)
  })

  ipcMain.handle('asana:createTask', async (_event, args: AsanaCreateTaskArgs) => {
    if (!args?.projectGid || !args?.name?.trim()) {
      throw new Error('projectGid and name are required.')
    }
    return createTask(args)
  })

  ipcMain.handle(
    'asana:updateTask',
    async (_event, args: { taskGid: string; update: AsanaTaskUpdate }) => {
      if (!args?.taskGid) {
        throw new Error('taskGid is required.')
      }
      return updateTask(args.taskGid, args.update ?? {})
    }
  )
}
