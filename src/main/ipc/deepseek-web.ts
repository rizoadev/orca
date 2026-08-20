/**
 * Electron IPC handlers for the in-app DeepSeek Harness web view: start the
 * web host with a workspace directory and report status.
 */
import { ipcMain } from 'electron'
import type { DeepSeekWebManager } from '../deepseek/deepseek-web-manager'
import type {
  DeepSeekAgentPreset,
  DeepSeekSessionSummary,
  DeepSeekWebStatus
} from '../deepseek/deepseek-web-manager'

export function registerDeepSeekWebHandlers(manager: DeepSeekWebManager): void {
  ipcMain.removeHandler('deepseek-web:getStatus')
  ipcMain.removeHandler('deepseek-web:start')
  ipcMain.removeHandler('deepseek-web:stop')
  ipcMain.removeHandler('deepseek-web:listAgentPresets')
  ipcMain.removeHandler('deepseek-web:setDefaultAgentPreset')
  ipcMain.removeHandler('deepseek-web:listSessions')

  ipcMain.handle('deepseek-web:getStatus', async (): Promise<DeepSeekWebStatus> => {
    return manager.getStatus()
  })

  ipcMain.handle(
    'deepseek-web:start',
    async (_event, cwd: string | null): Promise<DeepSeekWebStatus> => {
      return manager.start(cwd)
    }
  )

  ipcMain.handle('deepseek-web:stop', async (): Promise<DeepSeekWebStatus> => {
    manager.stop()
    return manager.getStatus()
  })

  ipcMain.handle('deepseek-web:listAgentPresets', async (): Promise<DeepSeekAgentPreset[]> => {
    return manager.listAgentPresets()
  })

  ipcMain.handle(
    'deepseek-web:setDefaultAgentPreset',
    async (_event, id: string): Promise<DeepSeekWebStatus> => {
      return manager.setDefaultAgentPreset(id)
    }
  )

  ipcMain.handle('deepseek-web:listSessions', async (): Promise<DeepSeekSessionSummary[]> => {
    return manager.listSessions()
  })
}
