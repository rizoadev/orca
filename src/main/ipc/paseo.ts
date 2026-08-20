/**
 * Electron IPC handlers for the in-app Paseo view: daemon status/start/stop
 * and project auto-attach from the active worktree.
 */
import { ipcMain } from 'electron'
import type { PaseoDaemonManager } from '../paseo/daemon-manager'
import type { PaseoAutoAttach } from '../paseo/auto-attach'
import type { PaseoDaemonStatus } from '../paseo/daemon-manager'

export function registerPaseoHandlers(
  daemon: PaseoDaemonManager,
  autoAttach: PaseoAutoAttach
): void {
  ipcMain.removeHandler('paseo:getStatus')
  ipcMain.removeHandler('paseo:start')
  ipcMain.removeHandler('paseo:stop')
  ipcMain.removeHandler('paseo:attachProject')
  ipcMain.removeHandler('paseo:getDaemonUrl')

  ipcMain.handle('paseo:getStatus', async (): Promise<PaseoDaemonStatus> => {
    return daemon.getStatus()
  })

  ipcMain.handle('paseo:start', async (): Promise<PaseoDaemonStatus> => {
    return daemon.start()
  })

  ipcMain.handle('paseo:stop', async (): Promise<PaseoDaemonStatus> => {
    daemon.stop()
    return daemon.getStatus()
  })

  ipcMain.handle('paseo:attachProject', async (_event, path: string | null) => {
    const result = await autoAttach.attachWorktree(path)
    return { ok: true, ...result }
  })

  ipcMain.handle('paseo:getDaemonUrl', async (): Promise<string> => {
    return daemon.getUrl()
  })
}
