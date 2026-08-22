/**
 * Electron IPC handlers for the in-app Reasonix web view: start the
 * web server with a workspace directory, attach a directory, and report status.
 */
import { ipcMain } from 'electron'
import type { ReasonixWebManager } from '../reasonix/reasonix-web-manager'
import type { ReasonixSessionSummary } from '../../shared/reasonix-web-types'
import type { ReasonixProjectStatus, ReasonixWebStatus } from '../reasonix/reasonix-web-manager'

export function registerReasonixWebHandlers(manager: ReasonixWebManager): void {
  ipcMain.removeHandler('reasonix-web:getStatus')
  ipcMain.removeHandler('reasonix-web:start')
  ipcMain.removeHandler('reasonix-web:stop')
  ipcMain.removeHandler('reasonix-web:attachDirectory')
  ipcMain.removeHandler('reasonix-web:listProjects')
  ipcMain.removeHandler('reasonix-web:listSessions')
  ipcMain.removeHandler('reasonix-web:listBusyDirectories')

  ipcMain.handle('reasonix-web:listBusyDirectories', async (_event, directories: string[]) => {
    return manager.listBusyDirectories(Array.isArray(directories) ? directories : [])
  })

  ipcMain.handle('reasonix-web:listProjects', async (): Promise<ReasonixProjectStatus[]> => {
    return manager.listProjects()
  })

  ipcMain.handle('reasonix-web:getStatus', async (): Promise<ReasonixWebStatus> => {
    return manager.getStatus()
  })

  ipcMain.handle(
    'reasonix-web:start',
    async (_event, cwd: string | null): Promise<ReasonixWebStatus> => {
      return manager.start(cwd)
    }
  )

  ipcMain.handle('reasonix-web:stop', async (): Promise<ReasonixWebStatus> => {
    manager.stop()
    return manager.getStatus()
  })

  ipcMain.handle(
    'reasonix-web:attachDirectory',
    async (_event, directory: string | null): Promise<void> => {
      await manager.attachDirectory(directory)
    }
  )

  ipcMain.handle('reasonix-web:listSessions', async (): Promise<ReasonixSessionSummary[]> => {
    return manager.listSessions()
  })

  ipcMain.handle('reasonix-web:stopProject', async (_event, projectPath: string): Promise<void> => {
    manager.stopProject(projectPath)
  })

  ipcMain.handle(
    'reasonix-web:clearStorage',
    async (_event, projectPath: string): Promise<void> => {
      await manager.clearProjectStorage(projectPath)
    }
  )
}
