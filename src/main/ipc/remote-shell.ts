import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import type { SshTarget } from '../../shared/ssh-types'
import type { RemoteShellSpawnArgs, RemoteShellSpawnResult } from '../../shared/remote-shell-types'
import { createSshShellSessionService } from '../remote/ssh-shell-session-service'
import { isTrustedUIRenderer } from './ui'

const MAX_INPUT_BYTES = 64 * 1024

/** IPC surface for the Remote view's interactive SSH shells. */
export function registerRemoteShellHandlers(deps: {
  getTarget: (id: string) => SshTarget | undefined
  getMainWindow: () => BrowserWindow | null
}): void {
  const service = createSshShellSessionService({ getTarget: deps.getTarget })

  for (const channel of [
    'remoteShell:spawn',
    'remoteShell:input',
    'remoteShell:resize',
    'remoteShell:kill'
  ]) {
    ipcMain.removeHandler(channel)
  }

  const trustedSender = (event: IpcMainInvokeEvent): boolean => {
    try {
      return isTrustedUIRenderer(event.sender)
    } catch {
      return false
    }
  }

  ipcMain.handle(
    'remoteShell:spawn',
    (event, args: RemoteShellSpawnArgs): RemoteShellSpawnResult => {
      if (!trustedSender(event)) {
        return { ok: false, error: 'Untrusted renderer' }
      }
      if (typeof args?.targetId !== 'string' || args.targetId.length === 0) {
        return { ok: false, error: 'targetId is required' }
      }
      return service.spawn(args)
    }
  )

  ipcMain.handle('remoteShell:input', (event, args: { shellSessionId: string; data: string }) => {
    if (!trustedSender(event)) {
      return false
    }
    if (typeof args?.shellSessionId !== 'string' || typeof args.data !== 'string') {
      return false
    }
    // Why: cap paste size so a clipboard accident can't flood the PTY in one write.
    if (args.data.length > MAX_INPUT_BYTES) {
      return false
    }
    return service.write(args.shellSessionId, args.data)
  })

  ipcMain.handle(
    'remoteShell:resize',
    (event, args: { shellSessionId: string; cols: number; rows: number }) => {
      if (!trustedSender(event)) {
        return false
      }
      if (
        typeof args?.shellSessionId !== 'string' ||
        typeof args.cols !== 'number' ||
        typeof args.rows !== 'number'
      ) {
        return false
      }
      return service.resize(args.shellSessionId, args.cols, args.rows)
    }
  )

  ipcMain.handle('remoteShell:kill', (event, args: { shellSessionId: string }) => {
    if (!trustedSender(event)) {
      return false
    }
    if (typeof args?.shellSessionId !== 'string') {
      return false
    }
    return service.kill(args.shellSessionId)
  })

  ipcMain.on('remoteShell:disposeAll', (event) => {
    if (!trustedSender(event)) {
      return
    }
    service.disposeAll()
  })

  service.onData((data) => {
    const win = deps.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('remoteShell:data', data)
    }
  })
  service.onExit((exitEvent) => {
    const win = deps.getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('remoteShell:exit', exitEvent)
    }
  })
}
