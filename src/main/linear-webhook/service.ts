/** Native Linear Webhook Gateway service — mirrors TelegramBridge pattern. */
import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import type { Repo } from '../../shared/types'
import type {
  LinearWebhookConfig,
  LinearWebhookEvent,
  LinearWebhookInboundResult,
  LinearWebhookSetConfigInput,
  LinearWebhookStatus
} from '../../shared/linear-webhook-types'
import { postLinearComment } from './api'
import { resolveRepoIdFromIssue } from './mapping-store'
import { readTelegramBotToken } from '../telegram-bridge/bot-token-store'
import { TelegramBridgeMappingStore } from '../telegram-bridge/mapping-store'
import { sendTelegramMessage } from '../telegram-bridge/telegram-api'

const DEFAULT_CONFIG: LinearWebhookConfig = {
  enabled: false,
  gatewayUrl: 'http://127.0.0.1:18789',
  relayUrl: 'https://linear-orca-relay.ikamaigb.workers.dev',
  autoStart: true,
  debounceMs: 30_000
}

const MAX_EVENTS = 100

type SpawnTaskRequest = {
  spec: string
  title: string
  repoId?: string
  worktreeId?: string
  hostId?: string
  autopilot?: boolean
}

type RuntimeDeps = {
  getRuntime: () => OrcaRuntimeService | null
  getAgentStatusSnapshot: () => AgentStatusIpcPayload[]
  getRepos?: () => readonly Repo[]
  getDefaultAgent?: () => string | null
  getDisabledTuiAgents?: () => readonly string[] | null
}

/** Parse a Linear webhook payload (shape varies by event type). */
function parseLinearWebhook(body: unknown): {
  action?: string
  event?: string
  issue?: { id: string; title: string; description?: string | null }
  comment?: { id: string; body: string }
  team?: { id: string; key: string }
} | null {
  if (!body || typeof body !== 'object') {
    return null
  }
  const b = body as Record<string, unknown>
  const issue = b.issue as Record<string, unknown> | undefined
  const comment = b.comment as Record<string, unknown> | undefined
  const team = b.team as Record<string, unknown> | undefined
  return {
    action: typeof b.action === 'string' ? b.action : undefined,
    event: typeof b.event === 'string' ? b.event : undefined,
    issue: issue
      ? {
          id: String(issue.id ?? ''),
          title: String(issue.title ?? ''),
          description: issue.description as string | null | undefined
        }
      : undefined,
    comment: comment
      ? {
          id: String(comment.id ?? ''),
          body: String(comment.body ?? '')
        }
      : undefined,
    team: team
      ? {
          id: String(team.id ?? ''),
          key: String(team.key ?? '')
        }
      : undefined
  }
}

/** Decide whether this event should trigger an agent spawn. */
function shouldSpawn(parsed: ReturnType<typeof parseLinearWebhook>): boolean {
  if (!parsed?.issue) {
    return false
  }
  const title = parsed.issue.title.toLowerCase()
  const isMention = title.includes('@orca') || title.includes(' orca ')
  const isNew = (parsed.action === 'created' || parsed.event?.startsWith('issue.created')) ?? false
  return Boolean((isMention && isNew) || isNew)
}

export class LinearWebhookService {
  private readonly deps: RuntimeDeps
  private spawnTaskFn: ((req: SpawnTaskRequest) => Promise<{ taskId: string }>) | null = null
  private readonly config = { ...DEFAULT_CONFIG }
  private webContents: WebContents | null = null
  private running = false
  private lastError: string | null = null
  private lastEventAt: number | null = null
  private recentDispatches = new Map<string, number>() // issueId → timestamp
  private events: LinearWebhookEvent[] = []

  constructor(deps: RuntimeDeps) {
    this.deps = deps
  }

  setWebContents(wc: WebContents | null): void {
    this.webContents = wc
  }

  setSpawnTask(fn: (req: SpawnTaskRequest) => Promise<{ taskId: string }>): void {
    this.spawnTaskFn = fn
  }

  getConfig(): LinearWebhookConfig {
    return { ...this.config }
  }

  getStatus(): LinearWebhookStatus {
    return {
      config: this.config,
      running: this.running,
      lastError: this.lastError,
      lastEventAt: this.lastEventAt,
      eventCount: this.events.length
    }
  }

  getEvents(limit = 20): LinearWebhookEvent[] {
    return this.events.slice(-limit).toReversed()
  }

  async setConfig(input: LinearWebhookSetConfigInput): Promise<LinearWebhookStatus> {
    if (input.enabled !== undefined) {
      this.config.enabled = input.enabled as boolean
    }
    if (input.gatewayUrl !== undefined) {
      this.config.gatewayUrl = input.gatewayUrl
    }
    if (input.relayUrl !== undefined) {
      this.config.relayUrl = input.relayUrl
    }
    if (input.autoStart !== undefined) {
      this.config.autoStart = input.autoStart as boolean
    }
    if (input.debounceMs !== undefined) {
      this.config.debounceMs = input.debounceMs
    }
    this.emitStatus()
    return this.getStatus()
  }

  start(): void {
    this.running = true
    this.emitStatus()
  }

  stop(): void {
    this.running = false
    this.emitStatus()
  }

  /** Called by task-orchestration-gateway when a webhook POST arrives. */
  async handleWebhook(body: unknown): Promise<LinearWebhookInboundResult> {
    const parsed = parseLinearWebhook(body)
    if (!parsed?.issue) {
      return { ok: false, reason: 'no issue in payload' }
    }

    const { id: issueId, title, description } = parsed.issue
    const now = Date.now()
    const debounceMs = this.config.debounceMs

    // Debounce: ignore if same issue fired recently
    const last = this.recentDispatches.get(issueId)
    if (last && now - last < debounceMs) {
      this.pushEvent({
        type: 'issue.updated',
        issueId,
        issueIdentifier: '',
        issueTitle: title,
        action: 'ignored',
        detail: 'debounced'
      })
      return { ok: true, issueId, action: 'ignored', detail: 'debounced' }
    }

    // Only spawn on new issues with @orca mention or on comment replies
    if (!shouldSpawn(parsed) && !parsed.comment) {
      this.pushEvent({
        type: 'issue.created',
        issueId,
        issueIdentifier: '',
        issueTitle: title,
        action: 'ignored',
        detail: 'no mention or not new'
      })
      return { ok: true, issueId, action: 'ignored', detail: 'no trigger' }
    }

    // Resolve repo
    const repoId = resolveRepoIdFromIssue(title, description, this.deps.getRepos?.())
    this.recentDispatches.set(issueId, now)
    // Prune old entries
    if (this.recentDispatches.size > 200) {
      const oldest = this.recentDispatches.keys().next().value
      if (oldest) {
        this.recentDispatches.delete(oldest)
      }
    }

    // Spawn agent
    try {
      if (!this.spawnTaskFn) {
        throw new Error('spawnTask not initialized — orchestration DB unavailable')
      }
      const spec = parsed.comment?.body ?? `${title}\n\n${description ?? ''}`
      const result = await this.spawnTaskFn({
        spec,
        title,
        repoId,
        autopilot: true
      })
      this.lastEventAt = now

      // Comment back on Linear
      const welcomeMsg = `✅ Orca menerima task ini.\n🔗 Task ID: ${result.taskId}\n📁 Repo: ${repoId}`
      void postLinearComment({ issueId, body: welcomeMsg }).catch(() => {})

      // Send to Telegram using sidebar Telegram Bridge bot
      void (async () => {
        try {
          const token = readTelegramBotToken()
          if (!token) {
            return
          }
          const store = new TelegramBridgeMappingStore()
          const groupId = store.getTelegramGroupId()
          const allowedUsers = store.getAllowedTelegramUserIds()
          const mapping = repoId ? store.findByRepoId(repoId) : null
          const targetChatId = groupId ?? allowedUsers[0]
          if (!targetChatId) {
            return
          }
          const msg = [
            `📥 <b>Task Linear Masuk ke Orca!</b>`,
            ``,
            `📌 <b>${title}</b>`,
            repoId ? `📁 <b>Target Repo:</b> <code>${repoId}</code>` : '',
            `🆔 <b>Task ID:</b> <code>${result.taskId}</code>`,
            description ? `\n<blockquote>${description.slice(0, 200)}</blockquote>` : ''
          ]
            .filter(Boolean)
            .join('\n')

          await sendTelegramMessage({
            token,
            chatId: targetChatId,
            text: msg,
            messageThreadId: mapping?.messageThreadId
          })
        } catch (err) {
          console.warn('[linear-webhook] telegram alert failed:', err)
        }
      })()

      this.pushEvent({
        type: parsed.comment ? 'comment.created' : 'issue.mention',
        issueId,
        issueIdentifier: '',
        issueTitle: title,
        repoId,
        action: 'spawned',
        detail: result.taskId
      })

      return { ok: true, issueId, repoId, action: 'spawned', detail: result.taskId }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      this.pushEvent({
        type: parsed.comment ? 'comment.created' : 'issue.mention',
        issueId,
        issueIdentifier: '',
        issueTitle: title,
        repoId,
        action: 'error',
        detail: this.lastError
      })
      return { ok: false, reason: this.lastError }
    }
  }

  private pushEvent(event: Omit<LinearWebhookEvent, 'id' | 'at'> & { at?: number }): void {
    const full: LinearWebhookEvent = {
      id: randomUUID(),
      at: event.at ?? Date.now(),
      type: event.type,
      issueId: event.issueId,
      issueIdentifier: event.issueIdentifier,
      issueTitle: event.issueTitle,
      ...(event.repoId ? { repoId: event.repoId } : {}),
      action: event.action,
      ...(event.detail ? { detail: event.detail } : {})
    }
    this.events.push(full)
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS)
    }
    const wc = this.webContents
    if (wc && !wc.isDestroyed()) {
      wc.send('linearWebhook:event', full)
    }
  }

  private emitStatus(): void {
    const wc = this.webContents
    if (wc && !wc.isDestroyed()) {
      wc.send('linearWebhook:status', this.getStatus())
    }
  }
}
