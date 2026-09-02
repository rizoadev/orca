/**
 * Mobile Pi chat session hook: subscribe, send, stop, manage streaming state.
 * Mirrors the pattern of use-mobile-native-chat-session but for Pi SDK messages.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RpcClient } from '../transport/rpc-client'
import type { PiChatEvent, PiChatMessage, PiChatStatus } from '../../../src/shared/pi-chat-types'
import { createPiChatClient } from './pi-chat-rpc'
import { applyPiChatEvent, initialPiChatState, type PiChatLocalState } from './pi-chat-state'

export type MobilePiChatSession = {
  messages: PiChatMessage[]
  status: PiChatStatus
  error?: string
  /** Whether the agent is currently generating a response. */
  agentWorking: boolean
  /** Live partial assistant text while a turn is still streaming. */
  streamingText: string
}

export type MobilePiChatController = {
  session: MobilePiChatSession
  /** Send a user message. Returns true on delivery. */
  send: (text: string) => Promise<boolean>
  /** Stop the current turn. */
  stop: () => Promise<void>
  /** Start a new session (discard current). */
  newSession: () => Promise<void>
  /** Switch to a different session file. */
  switchSession: (path: string) => Promise<void>
  /** List available sessions. */
  listSessions: () => Promise<import('../../../src/shared/pi-chat-types').PiSessionInfo[]>
  /** List available models. */
  listModels: () => Promise<import('../../../src/shared/pi-chat-types').PiModelOption[]>
  /** Set the model. */
  setModel: (modelRef: string) => Promise<string>
  /** Delete a session file. */
  deleteSession: (path: string) => Promise<void>
}

export function useMobilePiChatController(args: {
  client: RpcClient | null
  worktreeId: string
  sessionId: string
  systemPrompt?: string
}): MobilePiChatController {
  const { client, worktreeId, sessionId, systemPrompt } = args
  const [chatState, setChatState] = useState<PiChatLocalState>(initialPiChatState)
  const { messages, status, error, streamingText } = chatState
  const sendInFlightRef = useRef(false)

  // Subscribe to the Pi chat stream.
  useEffect(() => {
    if (!client) {
      setChatState(initialPiChatState)
      return
    }
    let cancelled = false
    let unsub: (() => void) | null = null

    const piChat = createPiChatClient(client)
    // Start subscription to get running state + live events.
    unsub = piChat.subscribe(
      { worktreeId, sessionId, systemPrompt, sessionMode: 'continue' },
      (event: PiChatEvent) => {
        if (cancelled) {
          return
        }
        setChatState((prev) => applyPiChatEvent(prev, event))
      }
    )

    // Fetch models on mount.
    void piChat.listModels()

    return () => {
      cancelled = true
      unsub?.()
    }
  }, [client, worktreeId, sessionId, systemPrompt])

  // Refresh session list.
  const refreshSessions = useCallback(async () => {
    if (!client) {
      return
    }
    const piChat = createPiChatClient(client)
    try {
      await piChat.listSessions(worktreeId, sessionId)
    } catch {
      // Best-effort
    }
  }, [client, worktreeId, sessionId])

  const send = useCallback(
    async (text: string): Promise<boolean> => {
      if (!client || sendInFlightRef.current || status === 'running') {
        return false
      }
      sendInFlightRef.current = true
      try {
        const piChat = createPiChatClient(client)
        await piChat.send({ worktreeId, sessionId, text })
        void refreshSessions()
        return true
      } catch (err) {
        setChatState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Send failed'
        }))
        return false
      } finally {
        sendInFlightRef.current = false
      }
    },
    [client, worktreeId, sessionId, status, refreshSessions]
  )

  const stop = useCallback(async () => {
    if (!client) {
      return
    }
    const piChat = createPiChatClient(client)
    try {
      await piChat.stop(sessionId)
    } catch {
      // Best-effort
    }
  }, [client, sessionId])

  const newSession = useCallback(async () => {
    if (!client) {
      return
    }
    setChatState(initialPiChatState)
    const piChat = createPiChatClient(client)
    try {
      const snapshot = await piChat.start({
        worktreeId,
        sessionId,
        systemPrompt,
        sessionMode: 'new'
      })
      setChatState({
        messages: snapshot.messages,
        status: snapshot.status,
        error: snapshot.error,
        streamingText: ''
      })
      void refreshSessions()
    } catch (err) {
      setChatState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to start new session'
      }))
    }
  }, [client, worktreeId, sessionId, systemPrompt, refreshSessions])

  const switchSession = useCallback(
    async (path: string) => {
      if (!client) {
        return
      }
      setChatState(initialPiChatState)
      const piChat = createPiChatClient(client)
      try {
        // Stop current session, then start a fresh one opened at the target file.
        await piChat.stop(sessionId)
        const snapshot = await piChat.start({
          worktreeId,
          sessionId,
          systemPrompt,
          sessionMode: { type: 'open', path }
        })
        setChatState({
          messages: snapshot.messages,
          status: snapshot.status,
          error: snapshot.error,
          streamingText: ''
        })
        void refreshSessions()
      } catch (err) {
        setChatState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : 'Failed to switch session'
        }))
      }
    },
    [client, worktreeId, sessionId, systemPrompt, refreshSessions]
  )

  const listSessions = useCallback(async () => {
    if (!client) {
      return []
    }
    const piChat = createPiChatClient(client)
    return await piChat.listSessions(worktreeId, sessionId)
  }, [client, worktreeId, sessionId])

  const listModels = useCallback(async () => {
    if (!client) {
      return []
    }
    const piChat = createPiChatClient(client)
    return await piChat.listModels()
  }, [client])

  const setModel = useCallback(
    async (modelRef: string) => {
      if (!client) {
        throw new Error('Not connected')
      }
      const piChat = createPiChatClient(client)
      return await piChat.setModel(sessionId, modelRef)
    },
    [client, sessionId]
  )

  const deleteSession = useCallback(
    async (path: string) => {
      if (!client) {
        return
      }
      const piChat = createPiChatClient(client)
      await piChat.deleteSession(sessionId, path)
      void refreshSessions()
    },
    [client, sessionId, refreshSessions]
  )

  return {
    session: {
      messages,
      status,
      error,
      agentWorking: status === 'running',
      streamingText
    },
    send,
    stop,
    newSession,
    switchSession,
    listSessions,
    listModels,
    setModel,
    deleteSession
  }
}
