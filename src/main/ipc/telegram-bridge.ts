import { ipcMain } from 'electron'
import type { TelegramBridgeService } from '../telegram-bridge/service'
import type {
  TelegramBridgeEnsureTopicInput,
  TelegramBridgeSendInput,
  TelegramBridgeSetConfigInput
} from '../../shared/telegram-bridge-types'

export function registerTelegramBridgeHandlers(service: TelegramBridgeService): void {
  ipcMain.handle('telegramBridge:getStatus', () => service.getStatus())
  ipcMain.handle('telegramBridge:getEvents', (_event, args?: { limit?: number }) =>
    service.getEvents(args?.limit)
  )
  ipcMain.handle('telegramBridge:setConfig', (_event, input: TelegramBridgeSetConfigInput) =>
    service.setConfig(input)
  )
  ipcMain.handle('telegramBridge:setBotToken', (_event, args: { token: string }) =>
    service.setBotToken(args.token)
  )
  ipcMain.handle('telegramBridge:clearBotToken', () => service.clearBotToken())
  ipcMain.handle('telegramBridge:deleteMapping', (_event, args: { id: string }) => {
    service.deleteMapping(args.id)
  })
  ipcMain.handle(
    'telegramBridge:ensureTopicForRepo',
    (_event, input: TelegramBridgeEnsureTopicInput) => service.ensureTopicForRepo(input)
  )
  ipcMain.handle('telegramBridge:ensureTopicsForAllRepos', () => service.ensureTopicsForAllRepos())
  ipcMain.handle('telegramBridge:sendFromOrca', (_event, input: TelegramBridgeSendInput) =>
    service.sendFromOrca(input)
  )
  ipcMain.handle('telegramBridge:start', () => service.start())
  ipcMain.handle('telegramBridge:stop', () => {
    service.stop()
  })
}
