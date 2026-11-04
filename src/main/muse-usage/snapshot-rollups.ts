import {
  buildUsageTokenBreakdownRows,
  buildUsageTokenDailyPoints,
  buildUsageTokenRecentSessions,
  buildUsageTokenSummary
} from '../usage/usage-snapshot-rollups'
import type {
  MuseUsageBreakdownKind,
  MuseUsageBreakdownRow,
  MuseUsageDailyPoint,
  MuseUsageRange,
  MuseUsageScope,
  MuseUsageSessionRow,
  MuseUsageSummary
} from '../../shared/muse-usage-types'
import type { MuseUsageDailyAggregate, MuseUsageSession } from './types'

export function buildMuseUsageSummary(
  scope: MuseUsageScope,
  range: MuseUsageRange,
  filteredDaily: MuseUsageDailyAggregate[],
  filteredSessions: MuseUsageSession[]
): MuseUsageSummary {
  return {
    scope,
    range,
    ...buildUsageTokenSummary(filteredDaily, filteredSessions),
    hasAnyMuseData: filteredSessions.length > 0 || filteredDaily.length > 0
  }
}

export function buildMuseUsageDailyPoints(
  filteredDaily: MuseUsageDailyAggregate[]
): MuseUsageDailyPoint[] {
  return buildUsageTokenDailyPoints(filteredDaily)
}

export function buildMuseUsageBreakdownRows(
  kind: MuseUsageBreakdownKind,
  scope: MuseUsageScope,
  filteredDaily: MuseUsageDailyAggregate[],
  filteredSessions: MuseUsageSession[]
): MuseUsageBreakdownRow[] {
  return buildUsageTokenBreakdownRows(kind, scope, filteredDaily, filteredSessions)
}

export function buildMuseUsageRecentSessions(
  filteredSessions: MuseUsageSession[],
  limit = 10
): MuseUsageSessionRow[] {
  return buildUsageTokenRecentSessions(filteredSessions, limit)
}
