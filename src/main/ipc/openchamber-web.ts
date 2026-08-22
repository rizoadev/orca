/**
 * Electron IPC handlers for the in-app OpenChamber web view: start the web
 * server with a workspace directory, attach a directory, and report status.
 */
import { ipcMain } from 'electron'
import type { OpenChamberWebManager } from '../openchamber/openchamber-web-manager'
import type { OpenChamberSessionSummary } from '../../shared/openchamber-web-types'
import type {
  OpenChamberProjectStatus,
  OpenChamberWebStatus
} from '../openchamber/openchamber-web-manager'

export function registerOpenChamberWebHandlers(manager: OpenChamberWebManager): void {
  ipcMain.removeHandler('openchamber-web:getStatus')
  ipcMain.removeHandler('openchamber-web:start')
  ipcMain.removeHandler('openchamber-web:stop')
  ipcMain.removeHandler('openchamber-web:attachDirectory')
  ipcMain.removeHandler('openchamber-web:listProjects')
  ipcMain.removeHandler('openchamber-web:listSessions')
  ipcMain.removeHandler('openchamber-web:listBusyDirectories')

  ipcMain.handle('openchamber-web:listBusyDirectories', async (_event, directories: string[]) => {
    return manager.listBusyDirectories(Array.isArray(directories) ? directories : [])
  })

  ipcMain.handle('openchamber-web:listProjects', async (): Promise<OpenChamberProjectStatus[]> => {
    return manager.listProjects()
  })

  ipcMain.handle('openchamber-web:getStatus', async (): Promise<OpenChamberWebStatus> => {
    return manager.getStatus()
  })

  ipcMain.handle(
    'openchamber-web:start',
    async (_event, cwd: string | null): Promise<OpenChamberWebStatus> => {
      return manager.start(cwd)
    }
  )

  ipcMain.handle('openchamber-web:stop', async (): Promise<OpenChamberWebStatus> => {
    manager.stop()
    return manager.getStatus()
  })

  ipcMain.handle(
    'openchamber-web:attachDirectory',
    async (_event, directory: string | null): Promise<void> => {
      await manager.attachDirectory(directory)
    }
  )

  ipcMain.handle('openchamber-web:listSessions', async (): Promise<OpenChamberSessionSummary[]> => {
    return manager.listSessions()
  })

  ipcMain.handle(
    'openchamber-web:stopProject',
    async (_event, projectPath: string): Promise<void> => {
      manager.stopProject(projectPath)
    }
  )

  ipcMain.handle(
    'openchamber-web:clearStorage',
    async (_event, projectPath: string): Promise<void> => {
      await manager.clearProjectStorage(projectPath)
    }
  )
}
