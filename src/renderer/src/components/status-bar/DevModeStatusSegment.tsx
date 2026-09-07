import { useEffect, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { isRendererDevBuild } from '@/lib/renderer-build-mode'
import type { AppIdentity } from '../../../../shared/app-identity'

// Why: a dev window and a packaged window look identical once the chrome is up,
// so the footer carries the only always-visible "this build runs from source"
// signal. The instance label (worktree @ branch) is shown inline because the
// mix-ups happen between parallel `pnpm run dev` runs, not between dev and prod.
export function DevModeStatusSegment({
  iconOnly = false
}: {
  iconOnly?: boolean
}): React.JSX.Element | null {
  const [identity, setIdentity] = useState<AppIdentity | null>(null)

  useEffect(() => {
    // Why: the render guard below already returns null in prod, so skip the IPC
    // instead of asking main for identity data nothing will read.
    const getIdentity = isRendererDevBuild ? window.api?.app?.getIdentity : undefined
    if (!getIdentity) {
      return
    }
    let disposed = false
    getIdentity().then(
      (next) => {
        if (!disposed) {
          setIdentity(next)
        }
      },
      () => {
        // Identity only enriches the badge; keep it when main is unreachable.
      }
    )
    return () => {
      disposed = true
    }
  }, [])

  if (!isRendererDevBuild) {
    return null
  }

  const instanceLabel = identity?.devLabel ?? null
  const tooltip = instanceLabel
    ? translate(
        'auto.components.status.bar.DevModeStatusSegment.withInstance',
        'Development build — running from source (pnpm run dev). Instance: {{instance}}',
        { instance: instanceLabel }
      )
    : translate(
        'auto.components.status.bar.DevModeStatusSegment.plain',
        'Development build — running from source (pnpm run dev)'
      )

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-testid="dev-mode-status-segment" className="flex shrink-0 items-center gap-1.5">
          <span className="inline-flex h-5 items-center rounded-sm border border-amber-500/45 bg-amber-500/10 px-1.5 font-mono text-[11px] font-semibold uppercase leading-none tracking-[0.05em] text-amber-600 dark:text-amber-400">
            {translate('auto.components.status.bar.DevModeStatusSegment.badge', 'Dev')}
          </span>
          {instanceLabel && !iconOnly ? (
            <span className="max-w-[160px] truncate font-mono text-[11px] text-muted-foreground">
              {instanceLabel}
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-[320px] whitespace-normal">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
