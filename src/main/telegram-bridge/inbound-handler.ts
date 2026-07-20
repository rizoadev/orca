import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { TelegramRepoTopicMapping } from '../../shared/telegram-bridge-types'
import type { TelegramBridgeMappingStore } from './mapping-store'
import { extractInboundText, sendTelegramMessage, type TelegramMessage } from './telegram-api'
import type { TelegramTypingLoopController } from './typing-loop'

type InboundDeps = {
  store: TelegramBridgeMappingStore
  typing: TelegramTypingLoopController
  getRuntime: () => OrcaRuntimeService | null
  resolveSessionTarget: (
    repoId: string
  ) => Promise<{ handle: string; worktreeId: string; state: string; receivedAt: number } | null>
  spawnDefaultAgentForRepo: (
    repoId: string,
    prompt: string
  ) => Promise<{ handle: string; worktreeId: string; state: string; receivedAt: number } | null>
  injectIntoTerminal: (runtime: OrcaRuntimeService, handle: string, text: string) => Promise<void>
  pushEvent: (event: {
    direction: 'inbound' | 'system'
    repoId?: string
    text: string
    detail?: string
  }) => void
  setLastError: (error: string) => void
  setLastInboundAt: (at: number) => void
  emitStatus: () => void
}

async function safeReply(
  token: string,
  mapping: TelegramRepoTopicMapping,
  text: string
): Promise<void> {
  try {
    await sendTelegramMessage({
      token,
      chatId: mapping.telegramChatId,
      messageThreadId: mapping.messageThreadId,
      text
    })
  } catch {
    // Ignore reply failures; status already records primary error.
  }
}

export async function handleTelegramInboundMessage(
  deps: InboundDeps,
  token: string,
  message: TelegramMessage
): Promise<void> {
  const text = extractInboundText(message)
  if (!text || message.from?.is_bot) {
    return
  }
  const allowed = deps.store.getAllowedTelegramUserIds()
  if (allowed.length === 0) {
    deps.pushEvent({ direction: 'system', text: 'Ignored inbound message: allowlist is empty' })
    return
  }
  const fromId = message.from?.id
  if (fromId === undefined || !allowed.includes(fromId)) {
    deps.pushEvent({
      direction: 'system',
      text: `Ignored inbound message from unauthorized user ${fromId ?? 'unknown'}`
    })
    return
  }
  const threadId = message.message_thread_id
  if (typeof threadId !== 'number') {
    deps.pushEvent({ direction: 'system', text: 'Ignored inbound message without forum topic' })
    return
  }
  const mapping = deps.store.findByTopic(message.chat.id, threadId)
  if (!mapping) {
    deps.pushEvent({
      direction: 'system',
      text: `No mapping for chat ${message.chat.id} topic ${threadId}`
    })
    return
  }

  deps.typing.start(mapping, mapping.repoId, () => deps.store.getEnabled())
  const existing = await deps.resolveSessionTarget(mapping.repoId)
  if (!existing) {
    const spawned = await deps.spawnDefaultAgentForRepo(mapping.repoId, text)
    if (!spawned) {
      deps.typing.stop(mapping.repoId)
      deps.pushEvent({
        direction: 'system',
        repoId: mapping.repoId,
        text: 'No live terminal/session for mapped repo and auto-spawn failed'
      })
      await safeReply(
        token,
        mapping,
        'No live Orca terminal for this repo, and auto-spawn failed. Open an agent session in Orca first.'
      )
      return
    }
    deps.setLastInboundAt(Date.now())
    deps.pushEvent({
      direction: 'inbound',
      repoId: mapping.repoId,
      text,
      detail: `spawned → ${spawned.handle}`
    })
    deps.emitStatus()
    return
  }

  const runtime = deps.getRuntime()
  if (!runtime) {
    deps.typing.stop(mapping.repoId)
    deps.pushEvent({ direction: 'system', repoId: mapping.repoId, text: 'Runtime unavailable' })
    return
  }

  try {
    await deps.injectIntoTerminal(runtime, existing.handle, text)
    deps.setLastInboundAt(Date.now())
    deps.pushEvent({
      direction: 'inbound',
      repoId: mapping.repoId,
      text,
      detail: `→ ${existing.handle}`
    })
    deps.emitStatus()
  } catch (error) {
    deps.typing.stop(mapping.repoId)
    const reason = error instanceof Error ? error.message : String(error)
    deps.setLastError(reason)
    deps.pushEvent({
      direction: 'system',
      repoId: mapping.repoId,
      text: `Inject failed: ${reason}`
    })
    await safeReply(token, mapping, `Failed to inject into Orca session: ${reason}`)
    deps.emitStatus()
  }
}
