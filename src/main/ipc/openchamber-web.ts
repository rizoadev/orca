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
import type { ServiceCooldownController } from '../services/service-cooldown-controller'
import { acquireHarness, releaseHarness } from '../services/harness-lifecycle'

export function registerOpenChamberWebHandlers(
  manager: OpenChamberWebManager,
  cooldown?: ServiceCooldownController
): void {
  ipcMain.removeHandler('openchamber-web:getStatus')
  ipcMain.removeHandler('openchamber-web:start')
  ipcMain.removeHandler('openchamber-web:stop')
  ipcMain.removeHandler('openchamber-web:attachDirectory')
  ipcMain.removeHandler('openchamber-web:release')
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
      // Why: when OpenChamber is cooled down, refuse to spawn a server.
      if (cooldown && !cooldown.canStart('openchamber')) {
        return manager.getStatus()
      }
      // Why: reference-count so the server stops only once its last tab
      // (in-app view or browser tab) closes.
      return acquireHarness('openchamber', cwd) ? await manager.start(cwd) : manager.getStatus()
    }
  )

  ipcMain.handle('openchamber-web:stop', async (): Promise<OpenChamberWebStatus> => {
    manager.stop()
    return manager.getStatus()
  })

  ipcMain.handle(
    'openchamber-web:attachDirectory',
    async (_event, directory: string | null): Promise<void> => {
      if (cooldown && !cooldown.canStart('openchamber')) {
        return
      }
      await manager.attachDirectory(directory)
    }
  )

  // Why: drop the calling tab's reference so an idle project's server is
  // stopped once the last consumer (in-app view or browser tab) goes away.
  ipcMain.handle(
    'openchamber-web:release',
    async (_event, projectPath: string | null): Promise<void> => {
      if (releaseHarness('openchamber', projectPath) && projectPath) {
        manager.stopProject(projectPath)
      }
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
