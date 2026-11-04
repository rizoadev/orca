import {
  buildUsageTokenBreakdownRows,
  buildUsageTokenDailyPoints,
  buildUsageTokenRecentSessions,
  buildUsageTokenSummary
} from '../usage/usage-snapshot-rollups'
import type {
  PiUsageBreakdownKind,
  PiUsageBreakdownRow,
  PiUsageDailyPoint,
  PiUsageRange,
  PiUsageScope,
  PiUsageSessionRow,
  PiUsageSummary
} from '../../shared/pi-usage-types'
import type { PiUsageDailyAggregate, PiUsageSession } from './types'

export function buildPiUsageSummary(
  scope: PiUsageScope,
  range: PiUsageRange,
  filteredDaily: PiUsageDailyAggregate[],
  filteredSessions: PiUsageSession[]
): PiUsageSummary {
  return {
    scope,
    range,
    ...buildUsageTokenSummary(filteredDaily, filteredSessions),
    hasAnyPiData: filteredSessions.length > 0 || filteredDaily.length > 0
  }
}

export function buildPiUsageDailyPoints(
  filteredDaily: PiUsageDailyAggregate[]
): PiUsageDailyPoint[] {
  return buildUsageTokenDailyPoints(filteredDaily)
}

export function buildPiUsageBreakdownRows(
  kind: PiUsageBreakdownKind,
  scope: PiUsageScope,
  filteredDaily: PiUsageDailyAggregate[],
  filteredSessions: PiUsageSession[]
): PiUsageBreakdownRow[] {
  return buildUsageTokenBreakdownRows(kind, scope, filteredDaily, filteredSessions)
}

export function buildPiUsageRecentSessions(
  filteredSessions: PiUsageSession[],
  limit = 10
): PiUsageSessionRow[] {
  return buildUsageTokenRecentSessions(filteredSessions, limit)
}
