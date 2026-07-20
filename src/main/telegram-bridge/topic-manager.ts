import type {
  TelegramBridgeEnsureAllTopicsResult,
  TelegramBridgeEnsureTopicInput,
  TelegramRepoTopicMapping
} from '../../shared/telegram-bridge-types'
import { hasTelegramBotToken, readTelegramBotToken } from './bot-token-store'
import type { TelegramBridgeMappingStore } from './mapping-store'
import type { TelegramBridgeRepoRef } from './spawn-agent'
import { createTelegramForumTopic } from './telegram-api'

type TopicManagerDeps = {
  store: TelegramBridgeMappingStore
  getRepos?: () => readonly TelegramBridgeRepoRef[]
  pushEvent: (event: { direction: 'system'; repoId?: string; text: string }) => void
  emitStatus: () => void
  setLastError: (error: string) => void
}

export class TelegramTopicManager {
  private readonly deps: TopicManagerDeps
  private topicCreateInFlight = new Map<string, Promise<TelegramRepoTopicMapping>>()
  private ensureAllInFlight: Promise<TelegramBridgeEnsureAllTopicsResult> | null = null

  constructor(deps: TopicManagerDeps) {
    this.deps = deps
  }

  async ensureTopicForRepo(
    input: TelegramBridgeEnsureTopicInput
  ): Promise<TelegramRepoTopicMapping> {
    const repoId = input.repoId.trim()
    if (!repoId) {
      throw new Error('repoId is required')
    }
    const existing = this.deps.store.findByRepoId(repoId)
    if (existing) {
      return existing
    }
    const chatId = this.deps.store.getTelegramGroupId()
    if (chatId === null) {
      throw new Error('telegramGroupId is not configured')
    }
    const repo = this.deps.getRepos?.().find((entry) => entry.id === repoId)
    return this.createTopicForRepoLocked({
      repoId,
      telegramChatId: chatId,
      topicName: input.topicName || repo?.displayName || repoId,
      label: input.label || repo?.displayName || repoId
    })
  }

  async ensureTopicsForAllRepos(): Promise<TelegramBridgeEnsureAllTopicsResult> {
    if (this.ensureAllInFlight) {
      return this.ensureAllInFlight
    }
    this.ensureAllInFlight = this.runEnsureTopicsForAllRepos().finally(() => {
      this.ensureAllInFlight = null
    })
    return this.ensureAllInFlight
  }

  async maybeAutoCreateTopicForRepo(repoId: string): Promise<TelegramRepoTopicMapping | null> {
    if (!this.deps.store.getEnabled()) {
      return null
    }
    const existing = this.deps.store.findByRepoId(repoId)
    if (existing) {
      return existing
    }
    if (this.deps.store.getTelegramGroupId() === null || !hasTelegramBotToken()) {
      return null
    }
    try {
      return await this.ensureTopicForRepo({ repoId })
    } catch (error) {
      this.deps.setLastError(error instanceof Error ? error.message : String(error))
      this.deps.emitStatus()
      return null
    }
  }

  private async runEnsureTopicsForAllRepos(): Promise<TelegramBridgeEnsureAllTopicsResult> {
    const result: TelegramBridgeEnsureAllTopicsResult = {
      created: [],
      existing: [],
      failed: []
    }
    if (!this.deps.store.getEnabled()) {
      return result
    }
    if (this.deps.store.getTelegramGroupId() === null) {
      result.failed.push({ repoId: '*', reason: 'telegramGroupId is not configured' })
      return result
    }
    if (!hasTelegramBotToken()) {
      result.failed.push({ repoId: '*', reason: 'Bot token is not configured' })
      return result
    }
    for (const repo of this.deps.getRepos?.() ?? []) {
      try {
        const before = this.deps.store.findByRepoId(repo.id)
        const mapping = await this.ensureTopicForRepo({
          repoId: repo.id,
          topicName: repo.displayName || repo.id,
          label: repo.displayName || repo.id
        })
        if (before) {
          result.existing.push(mapping)
        } else {
          result.created.push(mapping)
        }
      } catch (error) {
        result.failed.push({
          repoId: repo.id,
          reason: error instanceof Error ? error.message : String(error)
        })
      }
    }
    if (result.created.length > 0 || result.failed.length > 0) {
      this.deps.pushEvent({
        direction: 'system',
        text: `Auto topics: ${result.created.length} created, ${result.existing.length} existing, ${result.failed.length} failed`
      })
      this.deps.emitStatus()
    }
    return result
  }

  private async createTopicForRepoLocked(input: {
    repoId: string
    telegramChatId: number
    topicName?: string
    label?: string
  }): Promise<TelegramRepoTopicMapping> {
    const existing = this.deps.store.findByRepoId(input.repoId)
    if (existing) {
      return existing
    }
    const inFlight = this.topicCreateInFlight.get(input.repoId)
    if (inFlight) {
      return inFlight
    }
    const task = this.createTopicForRepoUncached(input).finally(() => {
      this.topicCreateInFlight.delete(input.repoId)
    })
    this.topicCreateInFlight.set(input.repoId, task)
    return task
  }

  private async createTopicForRepoUncached(input: {
    repoId: string
    telegramChatId: number
    topicName?: string
    label?: string
  }): Promise<TelegramRepoTopicMapping> {
    const token = readTelegramBotToken()
    if (!token) {
      throw new Error('Bot token is not configured')
    }
    const existing = this.deps.store.findByRepoId(input.repoId)
    if (existing) {
      return existing
    }
    const pathTail = input.repoId.split(/[\\/]/).findLast((part) => part.length > 0)
    const topicName = input.topicName?.trim() || input.label?.trim() || pathTail || input.repoId
    const topic = await createTelegramForumTopic({
      token,
      chatId: input.telegramChatId,
      name: topicName
    })
    const mapping = this.deps.store.upsertMapping({
      repoId: input.repoId,
      telegramChatId: input.telegramChatId,
      messageThreadId: topic.message_thread_id,
      label: input.label?.trim() || topic.name
    })
    this.deps.pushEvent({
      direction: 'system',
      repoId: input.repoId,
      text: `Created topic "${topic.name}" (#${topic.message_thread_id})`
    })
    this.deps.emitStatus()
    return mapping
  }
}
