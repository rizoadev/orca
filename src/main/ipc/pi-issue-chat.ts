import { ipcMain, type WebContents } from 'electron'
import type {
  PiIssueChatEvent,
  PiIssueChatSendArgs,
  PiIssueChatSessionSnapshot,
  PiIssueChatStartArgs,
  PiIssueChatSetModelArgs,
  PiModelOption
} from '../../shared/pi-issue-chat-types'
import {
  getPiIssueChatSession,
  getSessionsMap,
  sendPiIssueChatMessage,
  startPiIssueChatSession,
  stopPiIssueChatSession
} from '../pi/issue-chat-session'
import { listPiModels, setPiSessionModel } from '../pi/pi-model-registry'

function emitToSender(sender: WebContents, event: PiIssueChatEvent): void {
  if (sender.isDestroyed()) {
    return
  }
  sender.send('piIssueChat:event', event)
}

export function registerPiIssueChatHandlers(): void {
  ipcMain.handle(
    'piIssueChat:start',
    async (event, args: PiIssueChatStartArgs): Promise<PiIssueChatSessionSnapshot> => {
      if (!args?.sessionId || !args.cwd || typeof args.issueContext !== 'string') {
        throw new Error('Invalid piIssueChat:start args')
      }
      console.log('[pi-chat] start sessionId=%s cwd=%s', args.sessionId, args.cwd)
      try {
        const result = await startPiIssueChatSession(args, (payload) =>
          emitToSender(event.sender, payload)
        )
        console.log('[pi-chat] session ready model=%s/%s', result.provider, result.modelId)
        return result
      } catch (err) {
        console.error('[pi-chat] start FAILED:', err)
        throw err
      }
    }
  )

  ipcMain.handle(
    'piIssueChat:get',
    async (_event, sessionId: string): Promise<PiIssueChatSessionSnapshot | null> => {
      if (typeof sessionId !== 'string' || !sessionId) {
        return null
      }
      return getPiIssueChatSession(sessionId)
    }
  )

  ipcMain.handle('piIssueChat:send', async (event, args: PiIssueChatSendArgs): Promise<void> => {
    if (!args?.sessionId || typeof args.text !== 'string') {
      throw new Error('Invalid piIssueChat:send args')
    }
    console.log('[pi-chat] send sessionId=%s text=%s', args.sessionId, args.text.slice(0, 60))
    try {
      await sendPiIssueChatMessage(args.sessionId, args.text, (payload) =>
        emitToSender(event.sender, payload)
      )
    } catch (err) {
      console.error('[pi-chat] send FAILED:', err)
      throw err
    }
  })

  ipcMain.handle('piIssueChat:stop', async (_event, sessionId: string): Promise<void> => {
    if (typeof sessionId !== 'string' || !sessionId) {
      return
    }
    stopPiIssueChatSession(sessionId)
  })

  ipcMain.handle('piIssueChat:listModels', async (): Promise<PiModelOption[]> => {
    return listPiModels()
  })

  ipcMain.handle(
    'piIssueChat:setModel',
    async (_event, args: PiIssueChatSetModelArgs): Promise<string> => {
      if (!args?.sessionId || !args.modelRef) {
        throw new Error('Invalid piIssueChat:setModel args')
      }
      return setPiSessionModel(getSessionsMap(), args.sessionId, args.modelRef)
    }
  )
}
