/**
 * IPC handlers for the Service Cooldown feature. The renderer reads the
 * per-service enabled state and toggles services on/off; toggling a service off
 * (or pressing "Cool Down All") tears down its running work via the controller.
 */
import { ipcMain } from 'electron'
import type { ServiceCooldownController } from '../services/service-cooldown-controller'
import { SERVICE_COOLDOWN_IPC, type ServiceCooldownId } from '../../shared/service-cooldown-types'

export function registerServiceCooldownHandlers(controller: ServiceCooldownController): void {
  ipcMain.removeHandler(SERVICE_COOLDOWN_IPC.getState)
  ipcMain.removeHandler(SERVICE_COOLDOWN_IPC.setService)
  ipcMain.removeHandler(SERVICE_COOLDOWN_IPC.coolDownAll)
  ipcMain.removeHandler(SERVICE_COOLDOWN_IPC.resumeAll)

  ipcMain.handle(SERVICE_COOLDOWN_IPC.getState, () => controller.getState())

  ipcMain.handle(
    SERVICE_COOLDOWN_IPC.setService,
    async (_event, id: ServiceCooldownId, enabled: boolean): Promise<unknown> => {
      return controller.setService(id, enabled)
    }
  )

  ipcMain.handle(SERVICE_COOLDOWN_IPC.coolDownAll, async (): Promise<unknown> => {
    return controller.coolDownAll()
  })

  ipcMain.handle(SERVICE_COOLDOWN_IPC.resumeAll, async (): Promise<unknown> => {
    return controller.resumeAll()
  })
}
