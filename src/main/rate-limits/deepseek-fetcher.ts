import { net } from 'electron'
import type {
  ProviderRateLimits,
  RateLimitWindow,
  UsageRateLimitMetadata
} from '../../shared/rate-limit-types'
import { readFetchResponseJsonWithinLimit } from '../lib/fetch-response-body'

const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_API_BASE_URL?.trim().replace(/\/$/, '') || 'https://api.deepseek.com/v1'
const API_TIMEOUT_MS = 10_000
const WEEKLY_WINDOW_MINUTES = 10_080 // 7 days

type DeepSeekBalanceVal = { val?: string | number }

type DeepSeekBalance = {
  totalPay?: DeepSeekBalanceVal
  paymentAmount?: DeepSeekBalanceVal
  remainingAmount?: DeepSeekBalanceVal
  expireAt?: string
}

type DeepSeekPackageUsage = {
  groupId?: string
  leftPoints?: string | number
  totalPoints?: string | number
}

type DeepSeekUserBalanceResponse = {
  balance?: DeepSeekBalance
  packageUsages?: DeepSeekPackageUsage[]
}

type DeepSeekRateLimitConfig = {
  apiKey: string
}

function result(
  status: ProviderRateLimits['status'],
  error: string | null,
  usageMetadata?: UsageRateLimitMetadata
): ProviderRateLimits {
  return {
    provider: 'deepseek',
    session: null,
    weekly: null,
    updatedAt: Date.now(),
    error,
    status,
    ...(usageMetadata ? { usageMetadata } : {})
  }
}

function toInt(value: string | number | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseResetDescription(isoString: string | undefined): string | null {
  if (!isoString) {
    return null
  }
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

function mapBalanceUsage(balance: DeepSeekBalance | undefined): RateLimitWindow | null {
  if (!balance) {
    return null
  }
  const total = toInt(balance.totalPay?.val)
  const used = toInt(balance.paymentAmount?.val)
  if (total === null || total <= 0 || used === null) {
    return null
  }
  const resetsAt = balance.expireAt ? Date.parse(balance.expireAt) : null
  return {
    usedPercent: Math.min(100, Math.max(0, (used / total) * 100)),
    windowMinutes: WEEKLY_WINDOW_MINUTES,
    resetsAt: resetsAt !== null && Number.isFinite(resetsAt) ? resetsAt : null,
    resetDescription: parseResetDescription(balance.expireAt)
  }
}

function mapPackageUsage(pkg: DeepSeekPackageUsage | undefined): RateLimitWindow | null {
  if (!pkg) {
    return null
  }
  const total = toInt(pkg.totalPoints)
  const left = toInt(pkg.leftPoints)
  if (total === null || total <= 0 || left === null) {
    return null
  }
  const used = total - left
  return {
    usedPercent: Math.min(100, Math.max(0, (used / total) * 100)),
    windowMinutes: WEEKLY_WINDOW_MINUTES,
    resetsAt: null,
    resetDescription: null
  }
}

function mapUserBalanceResponse(data: DeepSeekUserBalanceResponse): ProviderRateLimits {
  const pkg = (data.packageUsages ?? [])[0]
  const balance = data.balance
  const session = mapPackageUsage(pkg) ?? mapBalanceUsage(balance)
  const weekly = mapBalanceUsage(balance)
  return {
    provider: 'deepseek',
    session,
    weekly,
    updatedAt: Date.now(),
    error: session || weekly ? null : 'DeepSeek usage response did not include usage data',
    status: session || weekly ? 'ok' : 'error'
  }
}

/**
 * Read-only usage fetch for DeepSeek.
 *
 * Why read-only: DeepSeek does not have a CLI coding agent or OAuth session
 * managed by Orca. The user supplies an API key in Settings; this fetcher only
 * reads the `/user_balance` endpoint to surface usage in the status bar. It
 * never makes billing changes or model requests.
 */
export async function fetchDeepSeekRateLimits(
  options: { apiKey?: string; signal?: AbortSignal } = {}
): Promise<ProviderRateLimits> {
  const apiKey = options.apiKey
  if (!apiKey || apiKey.trim().length === 0) {
    return result('unavailable', 'DeepSeek API key not configured')
  }

  try {
    const requestSignal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(API_TIMEOUT_MS)])
      : AbortSignal.timeout(API_TIMEOUT_MS)
    const res = await net.fetch(`${DEEPSEEK_BASE_URL}/user_balance`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      },
      signal: requestSignal
    })
    if (res.status === 401 || res.status === 403) {
      return result('error', `DeepSeek API key rejected (HTTP ${res.status})`)
    }
    if (!res.ok) {
      return result('error', `DeepSeek usage request failed (HTTP ${res.status})`)
    }
    const data = await readFetchResponseJsonWithinLimit<unknown>(res)
    return mapUserBalanceResponse(typeof data === 'object' && data !== null ? data : {})
  } catch (err) {
    return result('error', err instanceof Error ? err.message : 'DeepSeek usage request failed')
  }
}

export type { DeepSeekRateLimitConfig }
