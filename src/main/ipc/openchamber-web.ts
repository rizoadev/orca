/**
 * Electron IPC handlers for the in-app OpenChamber web view: start the web
 * server with a workspace directory, attach a directory, and report status.
 */
import { ipcMain } from 'electron'
import type { OpenChamberWebManager } from '../openchamber/openchamber-web-manager'
import type {
  OpenChamberSessionSummary,
  OpenChamberWebStatus
} from '../openchamber/openchamber-web-manager'

export function registerOpenChamberWebHandlers(manager: OpenChamberWebManager): void {
  ipcMain.removeHandler('openchamber-web:getStatus')
  ipcMain.removeHandler('openchamber-web:start')
  ipcMain.removeHandler('openchamber-web:stop')
  ipcMain.removeHandler('openchamber-web:attachDirectory')
  ipcMain.removeHandler('openchamber-web:listSessions')

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
}
