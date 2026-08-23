/**
 * Electron IPC handlers for the in-app Paseo view: daemon status/start/stop
 * and project auto-attach from the active worktree.
 */
import { ipcMain, session } from 'electron'
import type { PaseoDaemonManager } from '../paseo/daemon-manager'
import type { PaseoAutoAttach } from '../paseo/auto-attach'
import type { PaseoDaemonStatus } from '../paseo/daemon-manager'
import type { PaseoProjectStatus } from '../../shared/paseo-types'
import type { ServiceCooldownController } from '../services/service-cooldown-controller'
import { acquireHarness, releaseHarness } from '../services/harness-lifecycle'

export type PaseoHandlersOptions = {
  /** Enumerate every known Orca worktree path (for the up-front allocation). */
  listWorktreePaths?: () => string[]
}

export function registerPaseoHandlers(
  daemon: PaseoDaemonManager,
  autoAttach: PaseoAutoAttach,
  options: PaseoHandlersOptions = {},
  cooldown?: ServiceCooldownController
): void {
  ipcMain.removeHandler('paseo:getStatus')
  ipcMain.removeHandler('paseo:start')
  ipcMain.removeHandler('paseo:stop')
  ipcMain.removeHandler('paseo:attachProject')
  ipcMain.removeHandler('paseo:getDaemonUrl')
  ipcMain.removeHandler('paseo:listProjects')
  ipcMain.removeHandler('paseo:clearWebviewStorage')
  ipcMain.removeHandler('paseo:release')

  ipcMain.handle('paseo:getStatus', async (): Promise<PaseoDaemonStatus> => {
    return daemon.getStatus()
  })

  ipcMain.handle('paseo:clearWebviewStorage', async (): Promise<void> => {
    // Why: the SPA's host registry pins the daemon serverId; after the daemon
    // home is wiped the id changes and the stale registry makes the app reject
    // the connection (stuck on /open-project). Clearing the webview partition
    // lets the app re-bootstrap from the daemon-injected connection hint.
    await session.fromPartition('persist:paseo').clearStorageData()
  })

  ipcMain.handle('paseo:start', async (): Promise<PaseoDaemonStatus> => {
    // Why: when Paseo is cooled down, refuse to spawn the daemon.
    if (cooldown && !cooldown.canStart('paseo')) {
      return daemon.getStatus()
    }
    // Why: reference-count so the daemon stops only once its last tab
    // (in-app view or browser tab) closes.
    return acquireHarness('paseo', null) ? await daemon.start() : daemon.getStatus()
  })

  ipcMain.handle('paseo:stop', async (): Promise<PaseoDaemonStatus> => {
    daemon.stop()
    return daemon.getStatus()
  })

  // Why: drop the calling tab's reference so the daemon is stopped once the
  // last consumer (in-app view or browser tab) goes away.
  ipcMain.handle('paseo:release', async (): Promise<void> => {
    if (releaseHarness('paseo', null)) {
      daemon.stop()
    }
  })

  ipcMain.handle('paseo:attachProject', async (_event, path: string | null) => {
    const result = await autoAttach.attachWorktree(path)
    return { ok: true, ...result }
  })

  ipcMain.handle('paseo:getDaemonUrl', async (): Promise<string> => {
    return daemon.getUrl()
  })

  // Why: mirrors the OpenChamber pattern — list every Orca project and attach
  // (allocate) a Paseo workspace for each up front, so the overview table shows
  // all projects with their workspace ids without waiting for a visit.
  ipcMain.handle('paseo:listProjects', async (): Promise<PaseoProjectStatus[]> => {
    return autoAttach.attachAllWorktrees(options.listWorktreePaths?.() ?? [])
  })
}
