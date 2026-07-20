import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getCanonicalUserDataPath } from '../persistence'
import type {
  TelegramBridgeSetConfigInput,
  TelegramRepoTopicMapping
} from '../../shared/telegram-bridge-types'

const STATE_FILE = 'telegram-bridge-state.json'
const STATE_VERSION = 2

type PersistedState = {
  version: number
  enabled: boolean
  allowedTelegramUserIds: number[]
  /** Forum supergroup id (-100…). Legacy key `defaultTelegramChatId` is migrated on load. */
  telegramGroupId: number | null
  mappings: TelegramRepoTopicMapping[]
  /** Telegram getUpdates offset cursor. */
  updateOffset: number
}

const DEFAULT_STATE: PersistedState = {
  version: STATE_VERSION,
  enabled: false,
  allowedTelegramUserIds: [],
  telegramGroupId: null,
  mappings: [],
  updateOffset: 0
}

function getStatePath(): string {
  return join(getCanonicalUserDataPath(), STATE_FILE)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function sanitizeUserIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }
  const out: number[] = []
  const seen = new Set<number>()
  for (const entry of value) {
    const id = typeof entry === 'number' ? entry : Number(entry)
    if (!Number.isInteger(id) || seen.has(id)) {
      continue
    }
    seen.add(id)
    out.push(id)
  }
  return out
}

function sanitizeMapping(value: unknown): TelegramRepoTopicMapping | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const row = value as Partial<TelegramRepoTopicMapping>
  if (
    typeof row.id !== 'string' ||
    typeof row.repoId !== 'string' ||
    !row.repoId.trim() ||
    !isFiniteNumber(row.telegramChatId) ||
    !isFiniteNumber(row.messageThreadId)
  ) {
    return null
  }
  const now = Date.now()
  return {
    id: row.id,
    repoId: row.repoId.trim(),
    telegramChatId: row.telegramChatId,
    messageThreadId: row.messageThreadId,
    ...(typeof row.label === 'string' && row.label.trim() ? { label: row.label.trim() } : {}),
    createdAt: isFiniteNumber(row.createdAt) ? row.createdAt : now,
    updatedAt: isFiniteNumber(row.updatedAt) ? row.updatedAt : now
  }
}

function readGroupId(raw: Record<string, unknown>): number | null {
  if (raw.telegramGroupId === null) {
    return null
  }
  if (isFiniteNumber(raw.telegramGroupId)) {
    return raw.telegramGroupId
  }
  // Why: v1 stored this as defaultTelegramChatId before the simplified global config.
  if (raw.defaultTelegramChatId === null) {
    return null
  }
  if (isFiniteNumber(raw.defaultTelegramChatId)) {
    return raw.defaultTelegramChatId
  }
  return null
}

function sanitizeState(value: unknown): PersistedState {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_STATE, mappings: [] }
  }
  const raw = value as Record<string, unknown>
  const mappings = Array.isArray(raw.mappings)
    ? raw.mappings
        .map(sanitizeMapping)
        .filter((row): row is TelegramRepoTopicMapping => row !== null)
    : []
  return {
    version: STATE_VERSION,
    enabled: raw.enabled === true,
    allowedTelegramUserIds: sanitizeUserIds(raw.allowedTelegramUserIds),
    telegramGroupId: readGroupId(raw),
    mappings,
    updateOffset:
      Number.isInteger(raw.updateOffset) && (raw.updateOffset as number) > 0
        ? (raw.updateOffset as number)
        : 0
  }
}

export class TelegramBridgeMappingStore {
  private state: PersistedState

  constructor() {
    this.state = this.load()
  }

  private load(): PersistedState {
    const path = getStatePath()
    if (!existsSync(path)) {
      return { ...DEFAULT_STATE, mappings: [] }
    }
    try {
      return sanitizeState(JSON.parse(readFileSync(path, 'utf8')))
    } catch {
      console.warn('[telegram-bridge] failed to parse mapping state; using defaults')
      return { ...DEFAULT_STATE, mappings: [] }
    }
  }

  private persist(): void {
    const dir = getCanonicalUserDataPath()
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const path = getStatePath()
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(this.state, null, 2), { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, path)
  }

  getEnabled(): boolean {
    return this.state.enabled
  }

  getAllowedTelegramUserIds(): number[] {
    return [...this.state.allowedTelegramUserIds]
  }

  getTelegramGroupId(): number | null {
    return this.state.telegramGroupId
  }

  getMappings(): TelegramRepoTopicMapping[] {
    return this.state.mappings.map((row) => ({ ...row }))
  }

  getUpdateOffset(): number {
    return this.state.updateOffset
  }

  setUpdateOffset(offset: number): void {
    if (!Number.isInteger(offset) || offset < 0) {
      return
    }
    if (this.state.updateOffset === offset) {
      return
    }
    this.state.updateOffset = offset
    this.persist()
  }

  setConfig(input: TelegramBridgeSetConfigInput): void {
    if (typeof input.enabled === 'boolean') {
      this.state.enabled = input.enabled
    }
    if (input.allowedTelegramUserIds !== undefined) {
      this.state.allowedTelegramUserIds = sanitizeUserIds(input.allowedTelegramUserIds)
    }
    if (input.telegramGroupId !== undefined) {
      this.state.telegramGroupId =
        input.telegramGroupId === null
          ? null
          : isFiniteNumber(input.telegramGroupId)
            ? input.telegramGroupId
            : null
    }
    this.persist()
  }

  upsertMapping(input: {
    id?: string
    repoId: string
    telegramChatId: number
    messageThreadId: number
    label?: string
  }): TelegramRepoTopicMapping {
    const repoId = input.repoId.trim()
    if (!repoId) {
      throw new Error('repoId is required')
    }
    if (!Number.isFinite(input.telegramChatId) || !Number.isFinite(input.messageThreadId)) {
      throw new Error('telegramChatId and messageThreadId are required')
    }
    const now = Date.now()
    const existingById = input.id
      ? this.state.mappings.find((row) => row.id === input.id)
      : undefined
    // Why: one topic mapping per repo keeps isolation simple.
    const existingByRepo = this.state.mappings.find((row) => row.repoId === repoId)
    const base = existingById ?? existingByRepo
    const next: TelegramRepoTopicMapping = {
      id: base?.id ?? randomUUID(),
      repoId,
      telegramChatId: input.telegramChatId,
      messageThreadId: input.messageThreadId,
      ...(input.label?.trim()
        ? { label: input.label.trim() }
        : base?.label
          ? { label: base.label }
          : {}),
      createdAt: base?.createdAt ?? now,
      updatedAt: now
    }
    this.state.mappings = [
      ...this.state.mappings.filter((row) => row.id !== next.id && row.repoId !== repoId),
      next
    ]
    this.persist()
    return { ...next }
  }

  deleteMapping(id: string): void {
    const before = this.state.mappings.length
    this.state.mappings = this.state.mappings.filter((row) => row.id !== id)
    if (this.state.mappings.length !== before) {
      this.persist()
    }
  }

  findByTopic(chatId: number, messageThreadId: number): TelegramRepoTopicMapping | null {
    return (
      this.state.mappings.find(
        (row) => row.telegramChatId === chatId && row.messageThreadId === messageThreadId
      ) ?? null
    )
  }

  findByRepoId(repoId: string): TelegramRepoTopicMapping | null {
    return this.state.mappings.find((row) => row.repoId === repoId) ?? null
  }
}
