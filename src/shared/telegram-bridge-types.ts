/** Telegram remote chat bridge: one bot, one forum topic per repo. */

export type TelegramRepoTopicMapping = {
  id: string
  repoId: string
  /** Supergroup chat id that owns the forum topics. */
  telegramChatId: number
  /** Forum topic id (`message_thread_id`). */
  messageThreadId: number
  label?: string
  createdAt: number
  updatedAt: number
}

/** Global setup only — topic mappings are auto-managed per repo. */
export type TelegramBridgeConfig = {
  enabled: boolean
  /** Never expose the raw token over IPC. */
  botTokenConfigured: boolean
  /** Empty allowlist = deny all inbound user messages. */
  allowedTelegramUserIds: number[]
  /** Forum supergroup where every repo gets its own topic. */
  telegramGroupId: number | null
  /** Auto-created/linked topics (read-only for UI). */
  mappings: TelegramRepoTopicMapping[]
}

export type TelegramBridgeStatus = {
  config: TelegramBridgeConfig
  running: boolean
  lastError: string | null
  lastPolledAt: number | null
  lastInboundAt: number | null
  lastOutboundAt: number | null
  botUsername: string | null
}

export type TelegramBridgeSetConfigInput = {
  enabled?: boolean
  allowedTelegramUserIds?: number[]
  telegramGroupId?: number | null
}

export type TelegramBridgeEnsureTopicInput = {
  repoId: string
  topicName?: string
  label?: string
}

export type TelegramBridgeEnsureAllTopicsResult = {
  created: TelegramRepoTopicMapping[]
  existing: TelegramRepoTopicMapping[]
  failed: { repoId: string; reason: string }[]
}

export type TelegramBridgeSendInput = {
  repoId: string
  text: string
  /** When true (default), also mirror the user text into the mapped Telegram topic. */
  mirrorToTelegram?: boolean
}

export type TelegramBridgeInboundResult =
  | { ok: true; repoId: string; terminalHandle: string; text: string; spawned?: boolean }
  | { ok: false; reason: string }

export type TelegramBridgeSpawnResult =
  | { ok: true; terminalHandle: string; worktreeId: string }
  | { ok: false; reason: string }

export type TelegramBridgeEvent = {
  id: string
  at: number
  direction: 'inbound' | 'outbound' | 'system' | 'spawn'
  repoId?: string
  text: string
  detail?: string
}
