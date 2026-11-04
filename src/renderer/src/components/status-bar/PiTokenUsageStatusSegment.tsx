import { useEffect, useState } from 'react'
import { useAppStore } from '../../store'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { AgentIcon } from '@/lib/agent-catalog'
import { useNow } from '@/hooks/use-now'
import { formatUsageTokens } from '../stats/usage-overview-model'
import { formatUsageLocalDay } from '../../../../shared/usage-local-day'
import { translate } from '@/i18n/i18n'

// Rollups key days by local calendar; re-read it each minute so the chip survives midnight.
const DAY_TICK_MS = 60_000

/**
 * Today's Pi tokens in the footer. Pi exposes no quota API, so tokens from its session logs are the
 * comparable figure; the segment stays hidden until tracking is enabled in Settings → Stats.
 */
export function PiTokenUsageStatusSegment(): React.JSX.Element | null {
  const scanState = useAppStore((state) => state.piUsageScanState)
  const daily = useAppStore((state) => state.piUsageDaily)
  const summary = useAppStore((state) => state.piUsageSummary)
  const fetchPiUsage = useAppStore((state) => state.fetchPiUsage)
  const openSettingsTarget = useAppStore((state) => state.openSettingsTarget)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const enabled = scanState?.enabled === true
  const now = useNow(DAY_TICK_MS, enabled)
  const [today, setToday] = useState<string | null>(null)

  useEffect(() => {
    setToday(formatUsageLocalDay(new Date(now)))
  }, [now])

  useEffect(() => {
    // Paired web clients reach usage APIs through the host; the preload omits them without one.
    if (window.api?.piUsage) {
      void fetchPiUsage()
    }
  }, [fetchPiUsage])

  const todayTokens = today === null ? 0 : (daily.find((e) => e.day === today)?.totalTokens ?? 0)
  if (!enabled || todayTokens <= 0) {
    return null
  }

  const openStats = (): void => {
    openSettingsTarget({ pane: 'stats', repoId: null })
    openSettingsPage()
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex h-5 shrink-0 items-center gap-1 rounded px-1 text-foreground/70 hover:bg-muted"
          aria-label={translate(
            'auto.components.status.bar.PiTokenUsage.today',
            'Pi usage today: {{tokens}} tokens',
            { tokens: todayTokens.toLocaleString() }
          )}
          data-testid="pi-token-usage"
          onClick={openStats}
        >
          <AgentIcon agent="pi" size={12} />
          <span className="font-mono text-[11px] tabular-nums">
            {formatUsageTokens(todayTokens)}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {translate(
          'auto.components.status.bar.PiTokenUsage.details',
          '{{today}} tokens today · {{total}} in the last 30 days · {{sessionCount}} sessions',
          {
            today: todayTokens.toLocaleString(),
            total: (summary?.totalTokens ?? 0).toLocaleString(),
            sessionCount: summary?.sessions ?? 0
          }
        )}
      </TooltipContent>
    </Tooltip>
  )
}
