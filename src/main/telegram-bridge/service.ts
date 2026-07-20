import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type {
  TelegramBridgeConfig,
  TelegramBridgeEnsureAllTopicsResult,
  TelegramBridgeEnsureTopicInput,
  TelegramBridgeEvent,
  TelegramBridgeInboundResult,
  TelegramBridgeSendInput,
  TelegramBridgeSetConfigInput,
  TelegramBridgeStatus,
  TelegramRepoTopicMapping
} from '../../shared/telegram-bridge-types'
import {
  clearTelegramBotToken,
  hasTelegramBotToken,
  readTelegramBotToken,
  saveTelegramBotToken
} from './bot-token-store'
import { TelegramBridgeMappingStore } from './mapping-store'
import {
  handleAgentStatus as handleAgentStatusRuntime,
  injectIntoTerminal,
  pollLoop,
  resolveSessionTarget,
  sendOutbound,
  spawnDefaultAgentForRepo,
  type TelegramBridgeRuntimeHost
} from './service-runtime'
import type { TelegramBridgeRepoRef, TelegramBridgeWorktreeRef } from './spawn-agent'
import { getTelegramMe } from './telegram-api'
import { TelegramTopicManager } from './topic-manager'
import { TelegramTypingLoopController } from './typing-loop'

const MAX_EVENTS = 100

type RuntimeDeps = {
  getRuntime: () => OrcaRuntimeService | null
  getAgentStatusSnapshot: () => AgentStatusIpcPayload[]
  getRepos?: () => readonly TelegramBridgeRepoRef[]
  getWorktrees?: () => readonly TelegramBridgeWorktreeRef[]
  getDefaultAgent?: () => string | null
  getDisabledTuiAgents?: () => readonly string[] | null
}

export class TelegramBridgeService {
  private readonly store = new TelegramBridgeMappingStore()
  private readonly deps: RuntimeDeps
  private readonly typing = new TelegramTypingLoopController()
  private readonly topics: TelegramTopicManager
  private webContents: WebContents | null = null
  private running = false
  private pollLoopActive = false
  private stopRequested = false
  private lastError: string | null = null
  private lastPolledAt: number | null = null
  private lastInboundAt: number | null = null
  private lastOutboundAt: number | null = null
  private botUsername: string | null = null
  private events: TelegramBridgeEvent[] = []
  // Why: dedupe outbound mirrors when hook re-emits the same assistant preview.
  private lastMirroredByRepo = new Map<string, string>()
  // Why: one spawn per repo so concurrent Telegram messages don't open N agent tabs.
  private spawnInFlight = new Map<string, Promise<{ handle: string; worktreeId: string } | null>>()

  constructor(deps: RuntimeDeps) {
    this.deps = deps
    this.topics = new TelegramTopicManager({
      store: this.store,
      getRepos: deps.getRepos,
      pushEvent: (event) => this.pushEvent(event),
      emitStatus: () => this.emitStatus(),
      setLastError: (error) => {
        this.lastError = error
      }
    })
  }

  setWebContents(webContents: WebContents | null): void {
    this.webContents = webContents
  }

  getStatus(): TelegramBridgeStatus {
    return {
      config: this.getConfig(),
      running: this.running,
      lastError: this.lastError,
      lastPolledAt: this.lastPolledAt,
      lastInboundAt: this.lastInboundAt,
      lastOutboundAt: this.lastOutboundAt,
      botUsername: this.botUsername
    }
  }

  getConfig(): TelegramBridgeConfig {
    return {
      enabled: this.store.getEnabled(),
      botTokenConfigured: hasTelegramBotToken(),
      allowedTelegramUserIds: this.store.getAllowedTelegramUserIds(),
      telegramGroupId: this.store.getTelegramGroupId(),
      mappings: this.store.getMappings()
    }
  }

  getEvents(limit = 50): TelegramBridgeEvent[] {
    return this.events.slice(-Math.max(1, Math.min(limit, MAX_EVENTS)))
  }

  setConfig(input: TelegramBridgeSetConfigInput): TelegramBridgeStatus {
    this.store.setConfig(input)
    if (this.store.getEnabled()) {
      void this.start()
      if (this.store.getTelegramGroupId() !== null) {
        void this.topics.ensureTopicsForAllRepos()
      }
    } else {
      this.stop()
    }
    this.emitStatus()
    return this.getStatus()
  }

  setBotToken(token: string): TelegramBridgeStatus {
    saveTelegramBotToken(token)
    this.lastError = null
    if (this.store.getEnabled()) {
      void this.start()
    }
    this.emitStatus()
    return this.getStatus()
  }

  clearBotToken(): TelegramBridgeStatus {
    clearTelegramBotToken()
    this.botUsername = null
    this.stop()
    this.emitStatus()
    return this.getStatus()
  }

  deleteMapping(id: string): void {
    this.store.deleteMapping(id)
    this.emitStatus()
  }

  ensureTopicForRepo(input: TelegramBridgeEnsureTopicInput): Promise<TelegramRepoTopicMapping> {
    return this.topics.ensureTopicForRepo(input)
  }

  ensureTopicsForAllRepos(): Promise<TelegramBridgeEnsureAllTopicsResult> {
    return this.topics.ensureTopicsForAllRepos()
  }

  async sendFromOrca(input: TelegramBridgeSendInput): Promise<TelegramBridgeInboundResult> {
    const text = input.text.trim()
    if (!text) {
      return { ok: false, reason: 'empty_text' }
    }
    const repoId = input.repoId.trim()
    if (!repoId) {
      return { ok: false, reason: 'missing_repo' }
    }
    const host = this.runtimeHost()
    let target = await resolveSessionTarget(host, repoId)
    let spawned = false
    if (!target) {
      const spawnedTarget = await spawnDefaultAgentForRepo(host, repoId, text)
      if (!spawnedTarget) {
        return { ok: false, reason: 'no_live_session' }
      }
      target = spawnedTarget
      spawned = true
    }
    const runtime = this.deps.getRuntime()
    if (!runtime) {
      return { ok: false, reason: 'runtime_unavailable' }
    }
    const mapping =
      this.store.findByRepoId(repoId) ?? (await this.topics.maybeAutoCreateTopicForRepo(repoId))
    if (mapping) {
      this.typing.start(mapping, repoId, () => this.store.getEnabled())
    }
    if (!spawned) {
      try {
        await injectIntoTerminal(runtime, target.handle, text)
      } catch (error) {
        this.typing.stop(repoId)
        const reason = error instanceof Error ? error.message : String(error)
        this.lastError = reason
        this.emitStatus()
        return { ok: false, reason }
      }
    }
    this.lastInboundAt = Date.now()
    this.pushEvent({
      direction: 'inbound',
      repoId,
      text,
      detail: `${spawned ? 'spawned ' : ''}orca → ${target.handle}`
    })
    if (input.mirrorToTelegram !== false && mapping) {
      void sendOutbound(host, { mapping, text: `🧑 ${text}`, repoId })
    }
    this.emitStatus()
    return { ok: true, repoId, terminalHandle: target.handle, text, spawned }
  }

  async start(): Promise<void> {
    if (!this.store.getEnabled()) {
      return
    }
    const token = readTelegramBotToken()
    if (!token) {
      this.lastError = 'Bot token is not configured'
      this.running = false
      this.emitStatus()
      return
    }
    this.stopRequested = false
    if (this.pollLoopActive) {
      this.running = true
      this.emitStatus()
      return
    }
    try {
      const me = await getTelegramMe(token)
      this.botUsername = me.username ?? null
      this.lastError = null
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      this.running = false
      this.emitStatus()
      return
    }
    this.running = true
    this.pollLoopActive = true
    this.emitStatus()
    if (this.store.getTelegramGroupId() !== null) {
      void this.topics.ensureTopicsForAllRepos()
    }
    void pollLoop(this.runtimeHost(), token)
  }

  stop(): void {
    this.stopRequested = true
    this.running = false
    this.pollLoopActive = false
    this.typing.stopAll()
    this.emitStatus()
  }

  handleAgentStatus(payload: AgentStatusIpcPayload): void {
    handleAgentStatusRuntime(this.runtimeHost(), payload)
  }

  private runtimeHost(): TelegramBridgeRuntimeHost {
    return {
      store: this.store,
      typing: this.typing,
      topics: this.topics,
      deps: this.deps,
      spawnInFlight: this.spawnInFlight,
      lastMirroredByRepo: this.lastMirroredByRepo,
      // Why: poll loop reads this each iteration; method (not snapshot) sees live stop flag.
      isStopRequested: () => this.stopRequested,
      setRunning: (value) => {
        this.running = value
      },
      setPollLoopActive: (value) => {
        this.pollLoopActive = value
      },
      setLastError: (value) => {
        this.lastError = value
      },
      setLastPolledAt: (value) => {
        this.lastPolledAt = value
      },
      setLastInboundAt: (value) => {
        this.lastInboundAt = value
      },
      setLastOutboundAt: (value) => {
        this.lastOutboundAt = value
      },
      pushEvent: (event) => this.pushEvent(event),
      emitStatus: () => this.emitStatus(),
      isEnabled: () => this.store.getEnabled()
    }
  }

  private pushEvent(event: Omit<TelegramBridgeEvent, 'id' | 'at'> & { at?: number }): void {
    const full: TelegramBridgeEvent = {
      id: randomUUID(),
      at: event.at ?? Date.now(),
      direction: event.direction,
      text: event.text,
      ...(event.repoId ? { repoId: event.repoId } : {}),
      ...(event.detail ? { detail: event.detail } : {})
    }
    this.events.push(full)
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS)
    }
    const wc = this.webContents
    if (wc && !wc.isDestroyed()) {
      wc.send('telegramBridge:event', full)
    }
  }

  private emitStatus(): void {
    const wc = this.webContents
    if (wc && !wc.isDestroyed()) {
      wc.send('telegramBridge:status', this.getStatus())
    }
  }
}
