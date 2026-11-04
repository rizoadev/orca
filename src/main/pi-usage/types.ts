import type {
  UsageDailyAggregate,
  UsageLocationBreakdown,
  UsageLocationModelBreakdown,
  UsageModelBreakdown,
  UsageSession
} from '../usage/usage-rollup-records'

// Pi reports per-message tokens but no price for custom inference endpoints.
export type PiUsageMetric = Record<never, never>

export type PiUsageLocationBreakdown = UsageLocationBreakdown<PiUsageMetric>
export type PiUsageModelBreakdown = UsageModelBreakdown<PiUsageMetric>
export type PiUsageLocationModelBreakdown = UsageLocationModelBreakdown<PiUsageMetric>
export type PiUsageSession = UsageSession<PiUsageMetric>
export type PiUsageDailyAggregate = UsageDailyAggregate<PiUsageMetric>

export type PiUsageProcessedFile = {
  path: string
  mtimeMs: number
  size: number
}

export type PiUsagePersistedFile = PiUsageProcessedFile & {
  sessions: PiUsageSession[]
  dailyAggregates: PiUsageDailyAggregate[]
  /** Forked sessions copy parent records; ownership stops one record counting twice. */
  ownedEventKeys: string[]
  /** Reparse deferred files when their event owner disappears. */
  hasDeferredClaims: boolean
  /** Workspace recorded in the session header; null when the file predates it. */
  sessionCwd: string | null
}

export type PiUsagePersistedState = {
  schemaVersion: number
  worktreeFingerprint: string | null
  processedFiles: PiUsagePersistedFile[]
  sessions: PiUsageSession[]
  dailyAggregates: PiUsageDailyAggregate[]
  scanState: {
    enabled: boolean
    lastScanStartedAt: number | null
    lastScanCompletedAt: number | null
    lastScanError: string | null
  }
}

export type PiUsageParsedEvent = {
  sessionId: string
  timestamp: string
  /** Content key without the session ID, which forks rewrite. */
  eventKey: string
  model: string | null
  cwd: string | null
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type PiUsageAttributedEvent = PiUsageParsedEvent & {
  day: string
  projectKey: string
  projectLabel: string
  repoId: string | null
  worktreeId: string | null
}
