import { formatUsageLocalDay } from '../../../../shared/usage-local-day'

type UsageCalendarRange = '7d' | '30d' | '90d' | 'all'

export { getLocalUsageDay } from '../../../../shared/usage-local-day'

export function formatLocalDay(date: Date): string {
  return formatUsageLocalDay(date)
}

/** Moves a YYYY-MM-DD day by whole calendar days. */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function getUsageRangeCutoff(range: UsageCalendarRange): string | null {
  if (range === 'all') {
    return null
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (days - 1))
  return formatUsageLocalDay(cutoff)
}
