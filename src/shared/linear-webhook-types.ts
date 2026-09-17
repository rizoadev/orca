/** Types for the native Linear Webhook Gateway. */

export type LinearWebhookEventType =
  | 'issue.created'
  | 'issue.updated'
  | 'issue.mention'
  | 'comment.created'
  | 'comment.updated'

export type LinearWebhookConfig = {
  enabled: boolean
  /** Orca task gateway base URL — where CF Worker forwards webhooks. */
  gatewayUrl: string
  /** Cloudflare relay worker URL (for display / test). */
  relayUrl: string
  /** Auto-start on Orca launch. */
  autoStart: boolean
  /** Debounce window (ms) — ignore duplicate events from same issue within this window. */
  debounceMs: number
}

export type LinearWebhookStatus = {
  config: LinearWebhookConfig
  running: boolean
  lastError: string | null
  lastEventAt: number | null
  eventCount: number
}

export type LinearWebhookSetConfigInput = Partial<LinearWebhookConfig>

export type LinearWebhookEvent = {
  id: string
  at: number
  type: LinearWebhookEventType
  issueId: string
  issueIdentifier: string
  issueTitle: string
  repoId?: string
  action: 'spawned' | 'ignored' | 'error'
  detail?: string
}

export type LinearWebhookInboundResult =
  | { ok: true; issueId: string; repoId?: string; action: 'spawned' | 'ignored'; detail?: string }
  | { ok: false; reason: string }
