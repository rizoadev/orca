import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import { getRepoIdFromWorktreeId } from '../../shared/worktree-id'
import type { TelegramRepoTopicMapping } from '../../shared/telegram-bridge-types'
import { hasTelegramBotToken, readTelegramBotToken } from './bot-token-store'
import { handleTelegramInboundMessage } from './inbound-handler'
import type { TelegramBridgeMappingStore } from './mapping-store'
import { shouldMirrorAssistantMessage } from './session-target'
import { resolveTelegramBridgeInjectTarget } from './session-resolver'
import {
  runSpawnDefaultAgentForRepo,
  type TelegramBridgeRepoRef,
  type TelegramBridgeWorktreeRef
} from './spawn-agent'
import { getTelegramUpdates, sendTelegramMessage } from './telegram-api'
import type { TelegramTopicManager } from './topic-manager'
import type { TelegramTypingLoopController } from './typing-loop'

const MAX_TELEGRAM_TEXT = 3900

export type TelegramBridgeRuntimeHost = {
  store: TelegramBridgeMappingStore
  typing: TelegramTypingLoopController
  topics: TelegramTopicManager
  deps: {
    getRuntime: () => OrcaRuntimeService | null
    getAgentStatusSnapshot: () => AgentStatusIpcPayload[]
    getRepos?: () => readonly TelegramBridgeRepoRef[]
    getWorktrees?: () => readonly TelegramBridgeWorktreeRef[]
    getDefaultAgent?: () => string | null
    getDisabledTuiAgents?: () => readonly string[] | null
  }
  spawnInFlight: Map<string, Promise<{ handle: string; worktreeId: string } | null>>
  lastMirroredByRepo: Map<string, string>
  /** Live stop flag so poll loops see mutations mid-await. */
  isStopRequested: () => boolean
  setRunning: (value: boolean) => void
  setPollLoopActive: (value: boolean) => void
  setLastError: (value: string | null) => void
  setLastPolledAt: (value: number | null) => void
  setLastInboundAt: (value: number | null) => void
  setLastOutboundAt: (value: number | null) => void
  pushEvent: (event: {
    direction: 'inbound' | 'outbound' | 'system' | 'spawn'
    repoId?: string
    text: string
    detail?: string
  }) => void
  emitStatus: () => void
  isEnabled: () => boolean
}

function truncateTelegramText(text: string): string {
  if (text.length <= MAX_TELEGRAM_TEXT) {
    return `${text.slice(0, MAX_TELEGRAM_TEXT - 1)}…`
  }
  return text
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function resolveSessionTarget(host: TelegramBridgeRuntimeHost, repoId: string) {
  return resolveTelegramBridgeInjectTarget(
    {
      getRuntime: host.deps.getRuntime,
      getAgentStatusSnapshot: host.deps.getAgentStatusSnapshot,
      getRepos: host.deps.getRepos,
      pushEvent: (event) => host.pushEvent(event)
    },
    repoId
  )
}

export async function injectIntoTerminal(
  runtime: OrcaRuntimeService,
  handle: string,
  text: string
): Promise<void> {
  try {
    await runtime.sendTerminalAgentPrompt(handle, text)
  } catch (agentPromptError) {
    try {
      await runtime.sendTerminal(handle, { text, enter: true })
    } catch {
      throw agentPromptError
    }
  }
}

export async function spawnDefaultAgentForRepo(
  host: TelegramBridgeRuntimeHost,
  repoId: string,
  prompt: string
): Promise<{ handle: string; worktreeId: string; state: string; receivedAt: number } | null> {
  const inflight = host.spawnInFlight.get(repoId)
  if (inflight) {
    const result = await inflight
    return result
      ? {
          handle: result.handle,
          worktreeId: result.worktreeId,
          state: 'spawned',
          receivedAt: Date.now()
        }
      : null
  }
  const task = runSpawnDefaultAgentForRepo(
    {
      getRuntime: host.deps.getRuntime,
      getRepos: host.deps.getRepos,
      getWorktrees: host.deps.getWorktrees,
      getDefaultAgent: host.deps.getDefaultAgent,
      getDisabledTuiAgents: host.deps.getDisabledTuiAgents,
      resolveSessionTarget: (id) => resolveSessionTarget(host, id),
      pushEvent: (event) => host.pushEvent(event),
      setLastError: (error) => {
        host.setLastError(error)
      },
      emitStatus: () => host.emitStatus()
    },
    repoId,
    prompt
  ).finally(() => {
    host.spawnInFlight.delete(repoId)
  })
  host.spawnInFlight.set(repoId, task)
  const result = await task
  return result
    ? {
        handle: result.handle,
        worktreeId: result.worktreeId,
        state: 'spawned',
        receivedAt: Date.now()
      }
    : null
}

export async function sendOutbound(
  host: TelegramBridgeRuntimeHost,
  params: { mapping: TelegramRepoTopicMapping; text: string; repoId: string }
): Promise<void> {
  const token = readTelegramBotToken()
  if (!token) {
    return
  }
  try {
    await sendTelegramMessage({
      token,
      chatId: params.mapping.telegramChatId,
      messageThreadId: params.mapping.messageThreadId,
      text: truncateTelegramText(params.text)
    })
    host.setLastOutboundAt(Date.now())
    host.pushEvent({ direction: 'outbound', repoId: params.repoId, text: params.text })
    host.emitStatus()
  } catch (error) {
    host.setLastError(error instanceof Error ? error.message : String(error))
    host.emitStatus()
  }
}

export async function pollLoop(host: TelegramBridgeRuntimeHost, token: string): Promise<void> {
  while (!host.isStopRequested() && host.isEnabled()) {
    try {
      const updates = await getTelegramUpdates(token, Math.max(host.store.getUpdateOffset(), 0))
      host.setLastPolledAt(Date.now())
      host.setLastError(null)
      for (const update of updates) {
        host.store.setUpdateOffset(update.update_id + 1)
        if (update.message) {
          await handleTelegramInboundMessage(
            {
              store: host.store,
              typing: host.typing,
              getRuntime: host.deps.getRuntime,
              resolveSessionTarget: (id) => resolveSessionTarget(host, id),
              spawnDefaultAgentForRepo: (id, prompt) => spawnDefaultAgentForRepo(host, id, prompt),
              injectIntoTerminal,
              pushEvent: (event) => host.pushEvent(event),
              setLastError: (error) => {
                host.setLastError(error)
              },
              setLastInboundAt: (at) => {
                host.setLastInboundAt(at)
              },
              emitStatus: () => host.emitStatus()
            },
            token,
            update.message
          )
        }
      }
    } catch (error) {
      if (host.isStopRequested()) {
        break
      }
      host.setLastError(error instanceof Error ? error.message : String(error))
      host.emitStatus()
      await sleep(2_000)
    }
  }
  host.setPollLoopActive(false)
  host.setRunning(false)
  host.emitStatus()
}

export function handleAgentStatus(
  host: TelegramBridgeRuntimeHost,
  payload: AgentStatusIpcPayload
): void {
  if (!host.isEnabled() || !hasTelegramBotToken() || !payload.worktreeId) {
    return
  }
  if (payload.providerSessionOnly) {
    return
  }
  const repoId = getRepoIdFromWorktreeId(payload.worktreeId)
  if (payload.state === 'working' || payload.state === 'blocked') {
    const mapping = host.store.findByRepoId(repoId)
    if (mapping) {
      host.typing.start(mapping, repoId, () => host.isEnabled())
    }
    return
  }
  if (payload.state === 'done' || payload.state === 'waiting') {
    host.typing.stop(repoId)
  }
  if (
    !shouldMirrorAssistantMessage({
      state: payload.state,
      message: payload.lastAssistantMessage,
      previousMessage: undefined
    })
  ) {
    return
  }
  const message = payload.lastAssistantMessage?.trim()
  if (!message || host.lastMirroredByRepo.get(repoId) === message) {
    return
  }
  host.lastMirroredByRepo.set(repoId, message)
  void (async () => {
    const mapping =
      host.store.findByRepoId(repoId) ?? (await host.topics.maybeAutoCreateTopicForRepo(repoId))
    if (mapping) {
      await sendOutbound(host, { mapping, text: message, repoId })
    }
  })()
}
