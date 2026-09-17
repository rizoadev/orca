import { ipcMain } from 'electron'
import type { LinearWebhookService } from '../linear-webhook/service'
import type { LinearWebhookSetConfigInput } from '../../shared/linear-webhook-types'

export function registerLinearWebhookHandlers(service: LinearWebhookService): void {
  ipcMain.handle('linearWebhook:getStatus', () => service.getStatus())
  ipcMain.handle('linearWebhook:getEvents', (_event, args?: { limit?: number }) =>
    service.getEvents(args?.limit)
  )
  ipcMain.handle('linearWebhook:setConfig', (_event, input: LinearWebhookSetConfigInput) =>
    service.setConfig(input)
  )
  ipcMain.handle('linearWebhook:start', () => {
    service.start()
    return service.getStatus()
  })
  ipcMain.handle('linearWebhook:stop', () => {
    service.stop()
    return service.getStatus()
  })
  ipcMain.handle('linearWebhook:clearEvents', () => {
    service['events'] = []
    return service.getStatus()
  })
}
