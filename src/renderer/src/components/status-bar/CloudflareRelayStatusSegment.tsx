import { useCallback, useEffect, useRef, useState } from 'react'
import { CloudCog, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type { CloudflareRelayStatusPayload } from '../../../../shared/cloudflare-relay-status'

// Why: live footer indicator — green when the Cloudflare tunnel + WS transport
// are both up, red when broken, gray when unconfigured. Click → restart.
export function CloudflareRelayStatusSegment(_props: {
  compact?: boolean
  iconOnly?: boolean
}): React.JSX.Element {
  const [status, setStatus] = useState<CloudflareRelayStatusPayload | null>(null)
  const [restarting, setRestarting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.mobile.getCloudflareRelayStatus()
      setStatus(next)
    } catch {
      // keep last known status on IPC failure
    }
  }, [])

  useEffect(() => {
    void poll()
    timerRef.current = setInterval(() => void poll(), 10_000)
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [poll])

  const restart = async (): Promise<void> => {
    setRestarting(true)
    try {
      const result = await window.api.mobile.restartCloudflareRelay()
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to restart tunnel')
      } else {
        toast.success('Tunnel restarted')
      }
      await poll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restart tunnel')
    } finally {
      setRestarting(false)
    }
  }

  const ok = status?.state === 'running' && status.wsPort !== null
  const dotColor = !status?.configured
    ? 'bg-muted-foreground/40'
    : ok
      ? 'bg-emerald-500'
      : status?.state === 'provisioning'
        ? 'bg-amber-400'
        : 'bg-red-500'

  const label = !status?.configured
    ? translate('auto.components.statusbar.CloudflareRelay.tooltipUnconfigured', 'Cloudflare relay: not configured')
    : ok
      ? translate('auto.components.statusbar.CloudflareRelay.tooltipOk', 'Cloudflare relay: active')
      : translate('auto.components.statusbar.CloudflareRelay.tooltipDown', 'Cloudflare relay: down')

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-5 items-center gap-1 rounded px-1 text-foreground/70 hover:bg-muted"
              aria-label={label}
              data-testid="cloudflare-relay-status"
            >
              {restarting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <CloudCog className="size-3.5" aria-hidden />
              )}
              <span className={`size-1.5 rounded-full ${dotColor}`} aria-hidden />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          {translate('auto.components.statusbar.CloudflareRelay.title', 'Cloudflare relay')}
        </DropdownMenuLabel>
        <div className="space-y-1 px-2 py-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${dotColor}`} aria-hidden />
            <span className="text-foreground">
              {!status?.configured
                ? translate(
                    'auto.components.statusbar.CloudflareRelay.unconfigured',
                    'Not configured — add token + domain in Settings → Mobile'
                  )
                : ok
                  ? translate(
                      'auto.components.statusbar.CloudflareRelay.active',
                      'Tunnel active'
                    )
                  : status?.state === 'provisioning'
                    ? translate(
                        'auto.components.statusbar.CloudflareRelay.provisioning',
                        'Provisioning…'
                      )
                    : translate(
                        'auto.components.statusbar.CloudflareRelay.down',
                        'Tunnel down'
                      )}
            </span>
          </div>
          {status?.hostname ? (
            <div>
              <span className="text-muted-foreground">WS: </span>
              <code className="font-mono text-[11px]">{status.hostname}</code>
            </div>
          ) : null}
          <div>
            <span className="text-muted-foreground">
              {translate('auto.components.statusbar.CloudflareRelay.wsPort', 'WS port')}:{' '}
            </span>
            <code className="font-mono text-[11px]">{status?.wsPort ?? '—'}</code>
          </div>
          {status?.message ? (
            <div className="text-red-500">{status.message}</div>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void restart()
          }}
          disabled={restarting || !status?.configured}
          data-testid="cloudflare-relay-restart"
        >
          {restarting ? (
            <Loader2 className="mr-2 size-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="mr-2 size-3.5" aria-hidden />
          )}
          {translate('auto.components.statusbar.CloudflareRelay.restart', 'Restart tunnel / WS')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
