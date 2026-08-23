/**
 * Electron IPC handlers for the in-app DeepSeek Harness web view: start the
 * web host with a workspace directory and report status.
 */
import { ipcMain } from 'electron'
import type { DeepSeekWebManager } from '../deepseek/deepseek-web-manager'
import type {
  DeepSeekAgentPreset,
  DeepSeekProjectStatus,
  DeepSeekSessionSummary,
  DeepSeekWebStatus
} from '../deepseek/deepseek-web-manager'
import type { ServiceCooldownController } from '../services/service-cooldown-controller'
import { acquireHarness, releaseHarness } from '../services/harness-lifecycle'

export function registerDeepSeekWebHandlers(
  manager: DeepSeekWebManager,
  cooldown?: ServiceCooldownController
): void {
  ipcMain.removeHandler('deepseek-web:getStatus')
  ipcMain.removeHandler('deepseek-web:start')
  ipcMain.removeHandler('deepseek-web:stop')
  ipcMain.removeHandler('deepseek-web:listAgentPresets')
  ipcMain.removeHandler('deepseek-web:setDefaultAgentPreset')
  ipcMain.removeHandler('deepseek-web:listSessions')
  ipcMain.removeHandler('deepseek-web:listSessionsProbe')
  ipcMain.removeHandler('deepseek-web:listProjects')
  ipcMain.removeHandler('deepseek-web:stopProject')
  ipcMain.removeHandler('deepseek-web:release')

  ipcMain.handle('deepseek-web:listProjects', async (): Promise<DeepSeekProjectStatus[]> => {
    return manager.listProjects()
  })

  ipcMain.handle('deepseek-web:getStatus', async (): Promise<DeepSeekWebStatus> => {
    return manager.getStatus()
  })

  ipcMain.handle(
    'deepseek-web:start',
    async (_event, cwd: string | null): Promise<DeepSeekWebStatus> => {
      // Why: when DeepSeek is cooled down, refuse to spawn the host.
      if (cooldown && !cooldown.canStart('deepseek')) {
        return manager.getStatus()
      }
      // Why: reference-count so the host stops only once its last tab
      // (in-app view or browser tab) closes.
      return acquireHarness('deepseek', cwd) ? await manager.start(cwd) : manager.getStatus()
    }
  )

  ipcMain.handle('deepseek-web:stop', async (): Promise<DeepSeekWebStatus> => {
    manager.stop()
    return manager.getStatus()
  })

  // Why: drop the calling tab's reference so the harness host is stopped once
  // the last consumer (in-app view or browser tab) goes away.
  ipcMain.handle(
    'deepseek-web:release',
    async (_event, projectPath: string | null): Promise<void> => {
      if (releaseHarness('deepseek', projectPath)) {
        manager.stop()
      }
    }
  )

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

  ipcMain.handle('deepseek-web:listSessionsProbe', async (): Promise<DeepSeekSessionSummary[]> => {
    return manager.listSessionsProbed()
  })

  ipcMain.handle(
    'deepseek-web:stopProject',
    async (_event, _projectPath: string): Promise<void> => {
      manager.stopProject(_projectPath)
    }
  )
}
