import { ipcMain, dialog, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { requireSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'

/** Refusal threshold for the integrated remote editor; keeps exec round-trips bounded. */
const REMOTE_EDITOR_MAX_BYTES = 2 * 1024 * 1024

/** Local file/folder pickers backing the Remote view's upload actions. */
export function registerRemoteFilesHandlers(): void {
  ipcMain.removeHandler('remoteFiles:pickLocalPaths')
  ipcMain.handle(
    'remoteFiles:pickLocalPaths',
    async (
      event: IpcMainInvokeEvent,
      args: { mode: 'file' | 'directory'; multiple?: boolean }
    ): Promise<string[] | null> => {
      const properties: Electron.OpenDialogOptions['properties'] =
        args.mode === 'directory'
          ? ['openDirectory', 'createDirectory']
          : ['openFile', ...(args.multiple === false ? [] : (['multiSelections'] as const))]
      const options = { properties }
      const parentWindow: BrowserWindow | null | undefined = BrowserWindow.fromWebContents(
        event.sender
      )
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      return result.filePaths
    }
  )

  ipcMain.removeHandler('remoteFiles:readFile')
  ipcMain.handle(
    'remoteFiles:readFile',
    async (_event, args: { targetId: string; filePath: string }) => {
      const provider = requireSshFilesystemProvider(args.targetId)
      const stat = await provider.stat(args.filePath)
      if (stat.type !== 'file') {
        throw new Error('Not a regular file')
      }
      if (stat.size > REMOTE_EDITOR_MAX_BYTES) {
        throw new Error('File is too large to open in the editor (max 2 MB).')
      }
      return provider.readFile(args.filePath)
    }
  )

  ipcMain.removeHandler('remoteFiles:writeFile')
  ipcMain.handle(
    'remoteFiles:writeFile',
    async (_event, args: { targetId: string; filePath: string; content: string }) => {
      if (Buffer.byteLength(args.content, 'utf8') > REMOTE_EDITOR_MAX_BYTES) {
        throw new Error('Refusing to save: content exceeds the 2 MB editor limit.')
      }
      const provider = requireSshFilesystemProvider(args.targetId)
      await provider.writeFile(args.filePath, args.content)
      return { ok: true as const }
    }
  )
}
