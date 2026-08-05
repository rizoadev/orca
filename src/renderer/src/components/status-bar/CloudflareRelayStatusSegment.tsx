import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react'
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

// Why: live footer indicator — shows tunnel URL inline when active,
// clickable reconnect when down. Dropdown for details + copy.
export function CloudflareRelayStatusSegment(props: {
  compact?: boolean
  iconOnly?: boolean
}): React.JSX.Element | null {
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

  const copyHostname = (): void => {
    if (status?.hostname) {
      navigator.clipboard.writeText(`wss://${status.hostname}`).then(
        () => toast.success('Tunnel URL copied'),
        () => toast.error('Failed to copy')
      )
    }
  }

  // Hide entirely when not configured — no noise for users who don't use mobile relay.
  if (!status?.configured) {
    return null
  }

  const ok = status.state === 'running' && status.wsPort !== null
  const isProvisioning = status.state === 'provisioning'
  const iconOnly = props.iconOnly === true

  const dotColor = ok ? 'bg-emerald-500' : isProvisioning ? 'bg-amber-400' : 'bg-red-500'

  const label = ok
    ? `${status.hostname} — active`
    : isProvisioning
      ? 'Provisioning tunnel…'
      : 'Tunnel down — click to reconnect'

  // Inline tunnel URL display
  const tunnelDisplay = status.hostname ? (
    <span className="max-w-[180px] truncate font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
      {status.hostname}
    </span>
  ) : null

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
              {restarting || isProvisioning ? (
                <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
              ) : ok ? (
                <Wifi className="size-3.5 shrink-0 text-emerald-500" aria-hidden />
              ) : (
                <WifiOff
                  className="size-3.5 shrink-0 cursor-pointer text-red-500 hover:text-red-400"
                  aria-hidden
                  onClick={(e) => {
                    // Direct click on icon when down → reconnect immediately
                    e.stopPropagation()
                    void restart()
                  }}
                />
              )}
              {!iconOnly && (
                <>
                  <span className={`size-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden />
                  {tunnelDisplay}
                </>
              )}
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
              {ok
                ? translate('auto.components.statusbar.CloudflareRelay.active', 'Tunnel active')
                : isProvisioning
                  ? translate(
                      'auto.components.statusbar.CloudflareRelay.provisioning',
                      'Provisioning…'
                    )
                  : translate('auto.components.statusbar.CloudflareRelay.down', 'Tunnel down')}
            </span>
          </div>
          {status.hostname ? (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground shrink-0">URL: </span>
              <code className="font-mono text-[11px] truncate">wss://{status.hostname}</code>
              <button
                type="button"
                className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={copyHostname}
                aria-label="Copy tunnel URL"
              >
                <Copy className="size-3" />
              </button>
            </div>
          ) : null}
          <div>
            <span className="text-muted-foreground">
              {translate('auto.components.statusbar.CloudflareRelay.wsPort', 'WS port')}:{' '}
            </span>
            <code className="font-mono text-[11px]">{status.wsPort ?? '—'}</code>
          </div>
          {status.message ? <div className="text-red-500">{status.message}</div> : null}
        </div>
        <DropdownMenuSeparator />
        {status.hostname ? (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault()
              copyHostname()
            }}
          >
            <Copy className="mr-2 size-3.5" aria-hidden />
            {translate('auto.components.statusbar.CloudflareRelay.copyUrl', 'Copy tunnel URL')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            void restart()
          }}
          disabled={restarting}
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
