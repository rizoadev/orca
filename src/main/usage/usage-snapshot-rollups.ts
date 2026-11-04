/** Token-only providers (Muse, Pi) share these rollups; priced providers keep their own projections. */
import { highestUsageKey } from './highest-usage-key'
import type { UsageDailyAggregate, UsageSession } from './usage-rollup-records'

export type UsageTokenTotals = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type UsageTokenSummary = UsageTokenTotals & {
  sessions: number
  events: number
  topModel: string | null
  topProject: string | null
}

export type UsageTokenDailyPoint = UsageTokenTotals & { day: string }

export type UsageTokenBreakdownRow = UsageTokenTotals & {
  key: string
  label: string
  sessions: number
  events: number
}

export type UsageTokenSessionRow = UsageTokenTotals & {
  sessionId: string
  lastActiveAt: string
  durationMinutes: number
  projectLabel: string
  model: string | null
  events: number
}

function emptyTotals(): UsageTokenTotals {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0
  }
}

function addTotals(target: UsageTokenTotals, row: UsageTokenTotals): void {
  target.inputTokens += row.inputTokens
  target.cachedInputTokens += row.cachedInputTokens
  target.outputTokens += row.outputTokens
  target.reasoningOutputTokens += row.reasoningOutputTokens
  target.totalTokens += row.totalTokens
}

export function buildUsageTokenSummary<TMetric>(
  daily: readonly UsageDailyAggregate<TMetric>[],
  sessions: readonly UsageSession<TMetric>[]
): UsageTokenSummary {
  const totals = emptyTotals()
  let events = 0
  const byModel = new Map<string, number>()
  const byProject = new Map<string, number>()
  for (const row of daily) {
    addTotals(totals, row)
    events += row.eventCount
    const model = row.model ?? 'Unknown model'
    byModel.set(model, (byModel.get(model) ?? 0) + row.totalTokens)
    byProject.set(row.projectLabel, (byProject.get(row.projectLabel) ?? 0) + row.totalTokens)
  }
  return {
    sessions: sessions.length,
    events,
    ...totals,
    topModel: highestUsageKey(byModel),
    topProject: highestUsageKey(byProject)
  }
}

export function buildUsageTokenDailyPoints<TMetric>(
  daily: readonly UsageDailyAggregate<TMetric>[]
): UsageTokenDailyPoint[] {
  const byDay = new Map<string, UsageTokenDailyPoint>()
  for (const row of daily) {
    const existing = byDay.get(row.day) ?? { day: row.day, ...emptyTotals() }
    addTotals(existing, row)
    byDay.set(row.day, existing)
  }
  return [...byDay.values()].sort((left, right) => left.day.localeCompare(right.day))
}

export function buildUsageTokenBreakdownRows<TMetric>(
  kind: 'model' | 'project',
  scope: 'orca' | 'all',
  daily: readonly UsageDailyAggregate<TMetric>[],
  sessions: readonly UsageSession<TMetric>[]
): UsageTokenBreakdownRow[] {
  const rows = new Map<string, UsageTokenBreakdownRow>()
  for (const entry of daily) {
    const key = kind === 'model' ? (entry.model ?? 'unknown') : entry.projectKey
    const label = kind === 'model' ? (entry.model ?? 'Unknown model') : entry.projectLabel
    const existing = rows.get(key) ?? { key, label, sessions: 0, events: 0, ...emptyTotals() }
    existing.events += entry.eventCount
    addTotals(existing, entry)
    rows.set(key, existing)
  }

  for (const session of sessions) {
    const keys =
      kind === 'model'
        ? session.locationModelBreakdown
            .filter((entry) => scope === 'all' || entry.worktreeId !== null)
            .map((entry) => entry.modelKey)
        : session.locationBreakdown
            .filter((entry) => scope === 'all' || entry.worktreeId !== null)
            .map((entry) => entry.locationKey)
    for (const key of new Set(keys)) {
      const row = rows.get(key)
      if (row) {
        row.sessions++
      }
    }
  }

  return [...rows.values()].sort((left, right) => right.totalTokens - left.totalTokens)
}

export function buildUsageTokenRecentSessions<TMetric>(
  sessions: readonly UsageSession<TMetric>[],
  limit = 10
): UsageTokenSessionRow[] {
  return sessions.slice(0, limit).map((session) => ({
    sessionId: session.sessionId,
    lastActiveAt: session.lastTimestamp,
    durationMinutes: Math.max(
      0,
      Math.round(
        (new Date(session.lastTimestamp).getTime() - new Date(session.firstTimestamp).getTime()) /
          60_000
      )
    ),
    projectLabel: session.primaryProjectLabel,
    model: session.primaryModel,
    events: session.eventCount,
    inputTokens: session.totalInputTokens,
    cachedInputTokens: session.totalCachedInputTokens,
    outputTokens: session.totalOutputTokens,
    reasoningOutputTokens: session.totalReasoningOutputTokens,
    totalTokens: session.totalTokens
  }))
}
