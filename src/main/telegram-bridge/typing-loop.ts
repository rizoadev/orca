import type { TelegramRepoTopicMapping } from '../../shared/telegram-bridge-types'
import { readTelegramBotToken } from './bot-token-store'
import { sendTelegramChatAction } from './telegram-api'

// Why: Telegram expires typing indicators after ~5s; refresh before that while waiting.
const TYPING_REFRESH_MS = 4_000

type TypingLoopEntry = {
  stop: () => void
  repoId: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class TelegramTypingLoopController {
  private readonly loops = new Map<string, TypingLoopEntry>()

  start(mapping: TelegramRepoTopicMapping, repoId: string, isEnabled: () => boolean): void {
    if (this.loops.has(repoId)) {
      return
    }
    const token = readTelegramBotToken()
    if (!token) {
      return
    }
    let stopped = false
    const stop = (): void => {
      stopped = true
      this.loops.delete(repoId)
    }
    this.loops.set(repoId, { stop, repoId })
    const tick = async (): Promise<void> => {
      while (!stopped && isEnabled()) {
        try {
          await sendTelegramChatAction({
            token,
            chatId: mapping.telegramChatId,
            messageThreadId: mapping.messageThreadId,
            action: 'typing'
          })
        } catch {
          // Why: typing is best-effort; never fail the inject path on network blips.
        }
        await sleep(TYPING_REFRESH_MS)
      }
    }
    void tick()
  }

  stop(repoId: string): void {
    this.loops.get(repoId)?.stop()
  }

  stopAll(): void {
    for (const loop of this.loops.values()) {
      loop.stop()
    }
    this.loops.clear()
  }
}
