/**
 * Typed RPC client wrappers for workspace-scoped Pi chat. These ride the
 * same encrypted runtime channel as the rest of mobile, so the Pi agent keeps
 * running on the desktop host while the phone only sends bounded messages.
 */
import type { RpcClient } from '../transport/rpc-client'
import type {
  PiChatEvent,
  PiChatMessage,
  PiChatSessionSnapshot,
  PiChatStatus,
  PiModelOption,
  PiSessionInfo
} from '../../../src/shared/pi-chat-types'

export type PiChatSubscribeArgs = {
  worktreeId: string
  sessionId: string
  systemPrompt?: string
  modelRef?: string
  sessionMode?: 'continue' | 'new' | { type: 'open'; path: string }
}

export type PiChatClient = {
  start: (args: PiChatSubscribeArgs) => Promise<PiChatSessionSnapshot>
  send: (args: {
    worktreeId: string
    sessionId: string
    text: string
  }) => Promise<PiChatSessionSnapshot>
  stop: (sessionId: string) => Promise<void>
  listModels: () => Promise<PiModelOption[]>
  listSessions: (worktreeId: string, sessionId: string) => Promise<PiSessionInfo[]>
  setModel: (sessionId: string, modelRef: string) => Promise<string>
  deleteSession: (sessionId: string, sessionPath: string) => Promise<void>
  subscribe: (args: PiChatSubscribeArgs, onEvent: (event: PiChatEvent) => void) => () => void
}

export function createPiChatClient(client: RpcClient): PiChatClient {
  return {
    async start(args) {
      const response = await client.sendRequest('piChat.start', args)
      return response.ok
        ? (response.result as PiChatSessionSnapshot)
        : ({
            error: response.error?.message ?? 'Failed to start Pi chat'
          } as unknown as PiChatSessionSnapshot)
    },
    async send(args) {
      const response = await client.sendRequest('piChat.send', args)
      if (!response.ok) {
        throw new Error(response.error?.message ?? 'Failed to send message')
      }
      return response.result as PiChatSessionSnapshot
    },
    async stop(sessionId) {
      const response = await client.sendRequest('piChat.stop', { sessionId })
      if (!response.ok) {
        throw new Error(response.error?.message ?? 'Failed to stop')
      }
    },
    async listModels() {
      const response = await client.sendRequest('piChat.listModels', undefined)
      return response.ok ? (response.result as PiModelOption[]) : []
    },
    async listSessions(worktreeId, sessionId) {
      const response = await client.sendRequest('piChat.listSessions', { worktreeId, sessionId })
      return response.ok ? (response.result as PiSessionInfo[]) : []
    },
    async setModel(sessionId, modelRef) {
      const response = await client.sendRequest('piChat.setModel', { sessionId, modelRef })
      if (!response.ok) {
        throw new Error(response.error?.message ?? 'Failed to set model')
      }
      return response.result as string
    },
    async deleteSession(sessionId, sessionPath) {
      const response = await client.sendRequest('piChat.deleteSession', { sessionId, sessionPath })
      if (!response.ok) {
        throw new Error(response.error?.message ?? 'Failed to delete session')
      }
    },
    subscribe(args, onEvent) {
      return client.subscribe('piChat.subscribe', args, (raw) => {
        const event = raw as PiChatEvent & { type?: string }
        if (!event?.type) {
          return
        }
        if (event.type === ('end' as string)) {
          return
        }
        onEvent(event as PiChatEvent)
      })
    }
  }
}

export type { PiChatEvent, PiChatMessage, PiChatSessionSnapshot, PiChatStatus, PiSessionInfo }
