/**
 * Runtime RPC methods for workspace-scoped Pi chat (mobile + web).
 * Bridges the Pi SDK session engine to mobile clients via the encrypted
 * runtime RPC channel, so phones can send messages to a Pi agent running
 * on the desktop host.
 */
import { z } from 'zod'
import { defineMethod, defineStreamingMethod, type RpcAnyMethod } from '../core'
import {
  subscribeToPiChat,
  getPiChatSession,
  sendPiChatMessage,
  stopPiChatSession,
  listPiChatModels,
  setPiChatModel,
  listPiChatSessions,
  deletePiChatSession
} from '../../../pi/workspace-chat-session'
import type { PiChatEvent } from '../../../../shared/pi-chat-types'

const PiChatSession = z.object({
  sessionId: z.string().min(1, 'Missing session id'),
  worktreeId: z.string().min(1, 'Missing worktree id'),
  systemPrompt: z.string().optional(),
  modelRef: z.string().optional(),
  // Why: mobile clients reuse one sessionId across tabs; this token disambiguates
  // concurrent subscriptions so cleanup does not kill a sibling stream.
  subscriptionId: z.string().min(1).optional(),
  sessionMode: z
    .union([
      z.literal('continue'),
      z.literal('new'),
      z.object({ type: z.literal('open'), path: z.string() })
    ])
    .optional()
})

const PiChatSend = z.object({
  sessionId: z.string().min(1, 'Missing session id'),
  worktreeId: z.string().min(1, 'Missing worktree id'),
  text: z.string().min(1, 'Missing text')
})

const PiChatSetModel = z.object({
  sessionId: z.string().min(1, 'Missing session id'),
  modelRef: z.string().min(1, 'Missing model ref')
})

const PiChatListSessions = z.object({
  sessionId: z.string().min(1, 'Missing session id'),
  worktreeId: z.string().min(1, 'Missing worktree id')
})

const PiChatDeleteSession = z.object({
  sessionId: z.string().min(1, 'Missing session id'),
  sessionPath: z.string().min(1, 'Missing session path')
})

const PiChatUnsubscribe = z.object({
  subscriptionId: z.string().min(1).optional()
})

export const PI_CHAT_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'piChat.start',
    params: PiChatSession,
    handler: async (params, { runtime }) => {
      const snapshot =
        (await getPiChatSession(params.sessionId)) ??
        (
          await subscribeToPiChat(
            {
              sessionId: params.sessionId,
              worktreeId: params.worktreeId,
              systemPrompt: params.systemPrompt,
              modelRef: params.modelRef,
              sessionMode: params.sessionMode
            },
            (worktreeId) => runtime.resolveWorktreePath(worktreeId),
            // No-op emitter for one-shot start; the caller uses subscribe for live events.
            () => {}
          )
        ).snapshot
      return snapshot
    }
  }),
  defineMethod({
    name: 'piChat.get',
    params: z.object({ sessionId: z.string().min(1) }),
    handler: async (params) => {
      return (await getPiChatSession(params.sessionId)) ?? { error: 'Session not found' }
    }
  }),
  defineMethod({
    name: 'piChat.send',
    params: PiChatSend,
    handler: async (params, { runtime }) => {
      return await sendPiChatMessage(
        params.sessionId,
        params.worktreeId,
        params.text,
        (worktreeId) => runtime.resolveWorktreePath(worktreeId)
      )
    }
  }),
  defineMethod({
    name: 'piChat.stop',
    params: z.object({ sessionId: z.string().min(1) }),
    handler: async (params) => {
      await stopPiChatSession(params.sessionId)
      return { stopped: true }
    }
  }),
  defineMethod({
    name: 'piChat.listModels',
    params: null,
    handler: async () => {
      return listPiChatModels()
    }
  }),
  defineMethod({
    name: 'piChat.listSessions',
    params: PiChatListSessions,
    handler: async (params, { runtime }) => {
      return await listPiChatSessions(params.sessionId, params.worktreeId, (worktreeId) =>
        runtime.resolveWorktreePath(worktreeId)
      )
    }
  }),
  defineMethod({
    name: 'piChat.setModel',
    params: PiChatSetModel,
    handler: async (params) => {
      return await setPiChatModel(params.sessionId, params.modelRef)
    }
  }),
  defineMethod({
    name: 'piChat.deleteSession',
    params: PiChatDeleteSession,
    handler: async (params) => {
      await deletePiChatSession(params.sessionId, params.sessionPath)
      return { deleted: true }
    }
  }),
  defineStreamingMethod({
    name: 'piChat.subscribe',
    params: PiChatSession,
    handler: async (params, { runtime, connectionId }, emit) => {
      let closed = false
      let unsubscribe = (): void => {}
      const cleanupToken = params.subscriptionId ?? `${params.worktreeId}:${params.sessionId}`
      const subscriptionId = `piChat:${connectionId ?? 'local'}:${cleanupToken}`

      runtime.registerSubscriptionCleanup(
        subscriptionId,
        () => {
          closed = true
          unsubscribe()
          emit({ type: 'end' })
        },
        connectionId
      )
      if (closed) {
        return
      }

      const emitter = (event: PiChatEvent): void => {
        if (closed) {
          return
        }
        if (event.type === 'snapshot') {
          emit({ type: 'snapshot', session: event.session })
        } else if (event.type === 'message') {
          emit({ type: 'message', sessionId: event.sessionId, message: event.message })
        } else if (event.type === 'assistantDelta') {
          emit({
            type: 'assistantDelta',
            sessionId: event.sessionId,
            messageId: event.messageId,
            delta: event.delta
          })
        } else if (event.type === 'status') {
          emit({
            type: 'status',
            sessionId: event.sessionId,
            status: event.status,
            error: event.error
          })
        } else if (event.type === 'tool') {
          emit({
            type: 'tool',
            sessionId: event.sessionId,
            toolName: event.toolName,
            messageId: event.messageId
          })
        }
      }

      const result = await subscribeToPiChat(
        {
          sessionId: params.sessionId,
          worktreeId: params.worktreeId,
          systemPrompt: params.systemPrompt,
          modelRef: params.modelRef,
          sessionMode: params.sessionMode
        },
        (worktreeId) => runtime.resolveWorktreePath(worktreeId),
        emitter
      )

      if (closed) {
        result.unsubscribe()
        return
      }
      unsubscribe = result.unsubscribe
    }
  }),
  defineMethod({
    name: 'piChat.unsubscribe',
    params: PiChatUnsubscribe,
    handler: async (_params, { runtime, connectionId }) => {
      const connection = connectionId ?? 'local'
      runtime.cleanupSubscriptionsByPrefix(`piChat:${connection}:`)
      return { unsubscribed: true }
    }
  })
]
