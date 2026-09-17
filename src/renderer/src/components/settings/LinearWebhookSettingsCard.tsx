import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Webhook } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import type {
  LinearWebhookEvent,
  LinearWebhookStatus
} from '../../../../shared/linear-webhook-types'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'

function statusTone(status: LinearWebhookStatus | null): 'connected' | 'attention' | 'neutral' {
  if (!status) {
    return 'neutral'
  }
  if (status.running && status.config.enabled) {
    return 'connected'
  }
  if (status.lastError || (status.config.enabled && !status.running)) {
    return 'attention'
  }
  return 'neutral'
}

function statusLabel(status: LinearWebhookStatus | null): string {
  if (!status) {
    return translate('settings.linearWebhook.status.unknown', 'Unknown')
  }
  if (status.running) {
    return translate('settings.linearWebhook.status.running', 'Running')
  }
  if (status.config.enabled) {
    return translate('settings.linearWebhook.status.enabled', 'Enabled')
  }
  return translate('settings.linearWebhook.status.off', 'Off')
}

export function LinearWebhookSettingsCard(): React.JSX.Element {
  const [status, setStatus] = useState<LinearWebhookStatus | null>(null)
  const [events, setEvents] = useState<LinearWebhookEvent[]>([])
  const [gatewayUrlDraft, setGatewayUrlDraft] = useState('')
  const [relayUrlDraft, setRelayUrlDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const [nextStatus, nextEvents] = await Promise.all([
      window.api.linearWebhook.getStatus(),
      window.api.linearWebhook.getEvents({ limit: 20 })
    ])
    setStatus(nextStatus)
    setEvents(nextEvents)
    setGatewayUrlDraft(nextStatus.config.gatewayUrl)
    setRelayUrlDraft(nextStatus.config.relayUrl)
  }, [])

  useEffect(() => {
    void refresh().catch(() => {})
    const offStatus = window.api.linearWebhook.onStatus((next) => {
      setStatus(next)
      setGatewayUrlDraft(next.config.gatewayUrl)
      setRelayUrlDraft(next.config.relayUrl)
    })
    const offEvent = window.api.linearWebhook.onEvent((event) => {
      setEvents((prev) => [...prev.slice(-19), event])
    })
    return () => {
      offStatus()
      offEvent()
    }
  }, [refresh])

  const saveConfig = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.linearWebhook.setConfig({
        gatewayUrl: gatewayUrlDraft,
        relayUrl: relayUrlDraft
      })
      await refresh()
      toast.success(translate('settings.linearWebhook.configSaved', 'Linear webhook config saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const toggleRunning = async (running: boolean): Promise<void> => {
    setBusy(true)
    try {
      await (running ? window.api.linearWebhook.start() : window.api.linearWebhook.stop())
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const clearLogs = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.linearWebhook.clearEvents()
      setEvents([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const tone = statusTone(status)
  const label = statusLabel(status)

  return (
    <IntegrationCardShell
      icon={<Webhook className="size-4" />}
      name={translate('settings.linearWebhook.name', 'Linear Webhook Gateway')}
      description={translate(
        'settings.linearWebhook.description',
        'Native webhook handler — receives Linear events from the Cloudflare relay and dispatches Orca agents directly.'
      )}
      statusLabel={label}
      statusTone={tone}
      checking={busy}
    >
      <IntegrationCardDetails>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="linear-gateway-url">
              {translate('settings.linearWebhook.gatewayUrl', 'Gateway URL')}
            </Label>
            <Input
              id="linear-gateway-url"
              value={gatewayUrlDraft}
              onChange={(e) => setGatewayUrlDraft(e.target.value)}
              placeholder="http://127.0.0.1:18789"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="linear-relay-url">
              {translate('settings.linearWebhook.relayUrl', 'Cloudflare Relay URL')}
            </Label>
            <Input
              id="linear-relay-url"
              value={relayUrlDraft}
              onChange={(e) => setRelayUrlDraft(e.target.value)}
              placeholder="https://linear-orca-relay.ikamaigb.workers.dev"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => toggleRunning(!status?.running)}
            disabled={busy}
          >
            {status?.running
              ? translate('settings.linearWebhook.stop', 'Stop')
              : translate('settings.linearWebhook.start', 'Start')}
          </Button>
          <Button variant="outline" size="sm" onClick={saveConfig} disabled={busy}>
            <RefreshCw className="mr-1 size-3.5" />
            {translate('settings.linearWebhook.save', 'Save')}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearLogs} disabled={busy}>
            {translate('settings.linearWebhook.clearLogs', 'Clear Logs')}
          </Button>
        </div>

        {status?.lastError && <p className="mt-2 text-xs text-destructive">{status.lastError}</p>}

        {events.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              {translate('settings.linearWebhook.recentEvents', 'Recent Events')}
            </p>
            {events.slice(0, 8).map((ev) => (
              <div
                key={ev.id}
                className="flex items-start gap-2 rounded px-2 py-1 text-xs"
                style={{
                  backgroundColor:
                    ev.action === 'spawned'
                      ? 'var(--status-success-background)'
                      : ev.action === 'error'
                        ? 'var(--destructive-background)'
                        : 'var(--muted-background)'
                }}
              >
                <span
                  className={`shrink-0 mt-0.5 size-1.5 rounded-full ${
                    ev.action === 'spawned'
                      ? 'bg-status-success'
                      : ev.action === 'error'
                        ? 'bg-destructive'
                        : 'bg-muted-foreground'
                  }`}
                />
                <span className="font-mono text-muted-foreground">{ev.issueId.slice(0, 8)}…</span>
                <span className="truncate">{ev.issueTitle}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {ev.action}
                </span>
              </div>
            ))}
          </div>
        )}
      </IntegrationCardDetails>
    </IntegrationCardShell>
  )
}
