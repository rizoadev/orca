import { ipcMain, type WebContents } from 'electron'
import type {
  StrandsIssueChatEvent,
  StrandsIssueChatSendArgs,
  StrandsIssueChatSessionSnapshot,
  StrandsIssueChatStartArgs
} from '../../shared/strands-issue-chat-types'
import {
  getStrandsIssueChatSession,
  sendStrandsIssueChatMessage,
  startStrandsIssueChatSession,
  stopStrandsIssueChatSession
} from '../strands/issue-chat-session'

function emitToSender(sender: WebContents, event: StrandsIssueChatEvent): void {
  if (sender.isDestroyed()) {
    return
  }
  sender.send('strandsIssueChat:event', event)
}

export function registerStrandsIssueChatHandlers(): void {
  ipcMain.handle(
    'strandsIssueChat:start',
    async (event, args: StrandsIssueChatStartArgs): Promise<StrandsIssueChatSessionSnapshot> => {
      if (!args?.sessionId || !args.cwd || typeof args.issueContext !== 'string') {
        throw new Error('Invalid strandsIssueChat:start args')
      }
      return await startStrandsIssueChatSession(args, (payload) =>
        emitToSender(event.sender, payload)
      )
    }
  )

  ipcMain.handle(
    'strandsIssueChat:get',
    async (_event, sessionId: string): Promise<StrandsIssueChatSessionSnapshot | null> => {
      if (typeof sessionId !== 'string' || !sessionId) {
        return null
      }
      return getStrandsIssueChatSession(sessionId)
    }
  )

  ipcMain.handle(
    'strandsIssueChat:send',
    async (event, args: StrandsIssueChatSendArgs): Promise<void> => {
      if (!args?.sessionId || typeof args.text !== 'string') {
        throw new Error('Invalid strandsIssueChat:send args')
      }
      await sendStrandsIssueChatMessage(args.sessionId, args.text, (payload) =>
        emitToSender(event.sender, payload)
      )
    }
  )

  ipcMain.handle('strandsIssueChat:stop', async (_event, sessionId: string): Promise<void> => {
    if (typeof sessionId !== 'string' || !sessionId) {
      return
    }
    stopStrandsIssueChatSession(sessionId)
  })
}
