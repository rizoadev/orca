import { ipcMain, type WebContents } from 'electron'
import type {
  PiIssueChatEvent,
  PiIssueChatSendArgs,
  PiIssueChatSessionSnapshot,
  PiIssueChatStartArgs
} from '../../shared/pi-issue-chat-types'
import {
  getPiIssueChatSession,
  sendPiIssueChatMessage,
  startPiIssueChatSession,
  stopPiIssueChatSession
} from '../pi/issue-chat-session'

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
      return await startPiIssueChatSession(args, (payload) => emitToSender(event.sender, payload))
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
    await sendPiIssueChatMessage(args.sessionId, args.text, (payload) =>
      emitToSender(event.sender, payload)
    )
  })

  ipcMain.handle('piIssueChat:stop', async (_event, sessionId: string): Promise<void> => {
    if (typeof sessionId !== 'string' || !sessionId) {
      return
    }
    stopPiIssueChatSession(sessionId)
  })
}
