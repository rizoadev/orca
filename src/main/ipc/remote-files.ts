import { ipcMain, dialog, BrowserWindow, type IpcMainInvokeEvent } from 'electron'

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
}
