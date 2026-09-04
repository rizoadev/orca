import { ipcMain, type WebContents } from 'electron'
import type {
  PiIssueChatEvent,
  PiIssueChatSendArgs,
  PiIssueChatSessionSnapshot,
  PiIssueChatStartArgs,
  PiIssueChatSetModelArgs,
  PiModelOption,
  PiSessionInfo
} from '../../shared/pi-issue-chat-types'
import {
  getPiIssueChatSession,
  getSessionsMap,
  detachPiIssueChatSession,
  sendPiIssueChatMessage,
  startPiIssueChatSession,
  stopPiIssueChatSession,
  abortPiIssueChatTurn
} from '../pi/issue-chat-session'
import { listPiModels, setPiSessionModel } from '../pi/pi-model-registry'
import { listPiIssueSessions, deletePiIssueSession } from '../pi/pi-session-manager'

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
    // Why: force-stop aborts the in-flight turn but keeps the session warm so
    // the user can immediately continue the conversation. Teardown lives in
    // newSession/switchSession/delete, not here.
    abortPiIssueChatTurn(sessionId)
  })

  // Why: detach is a soft disconnect — panel unmounts but session stays warm.
  // Preserves history + model when switching modal ↔ window mode.
  ipcMain.handle('piIssueChat:detach', async (_event, sessionId: string): Promise<void> => {
    if (typeof sessionId !== 'string' || !sessionId) {
      return
    }
    detachPiIssueChatSession(sessionId)
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

  ipcMain.handle(
    'piIssueChat:listSessions',
    async (_event, args: { sessionId: string; cwd: string }): Promise<PiSessionInfo[]> => {
      if (!args?.sessionId || !args.cwd) {
        return []
      }
      const record = getSessionsMap().get(args.sessionId)
      return listPiIssueSessions(args.cwd, args.sessionId, record?.sessionFile)
    }
  )

  ipcMain.handle(
    'piIssueChat:newSession',
    async (event, args: PiIssueChatStartArgs): Promise<PiIssueChatSessionSnapshot> => {
      if (!args?.sessionId || !args.cwd || typeof args.issueContext !== 'string') {
        throw new Error('Invalid piIssueChat:newSession args')
      }
      // Stop existing warm session so start creates a fresh one
      stopPiIssueChatSession(args.sessionId)
      return startPiIssueChatSession({ ...args, sessionMode: 'new' }, (payload) =>
        emitToSender(event.sender, payload)
      )
    }
  )

  ipcMain.handle(
    'piIssueChat:switchSession',
    async (
      event,
      args: { sessionId: string; cwd: string; issueContext: string; sessionPath: string }
    ): Promise<PiIssueChatSessionSnapshot> => {
      if (!args?.sessionId || !args.cwd || !args.sessionPath) {
        throw new Error('Invalid piIssueChat:switchSession args')
      }
      stopPiIssueChatSession(args.sessionId)
      return startPiIssueChatSession(
        {
          sessionId: args.sessionId,
          cwd: args.cwd,
          issueContext: args.issueContext,
          sessionMode: { type: 'open', path: args.sessionPath }
        },
        (payload) => emitToSender(event.sender, payload)
      )
    }
  )

  ipcMain.handle(
    'piIssueChat:deleteSession',
    async (_event, args: { sessionId: string; sessionPath: string }): Promise<void> => {
      if (!args?.sessionPath) {
        return
      }
      deletePiIssueSession(args.sessionPath)
      // If deleting active session, stop it so next open starts fresh
      const record = getSessionsMap().get(args.sessionId)
      if (record?.sessionFile === args.sessionPath) {
        stopPiIssueChatSession(args.sessionId)
      }
    }
  )
}
