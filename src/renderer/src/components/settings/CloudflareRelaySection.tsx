import { useCallback, useEffect, useState } from 'react'
import { CloudCog, Copy, Info, Link2, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

// Why: Cloudflare Relay replaces Orca Cloud — token + domain are the only
// required inputs. With both set the tunnel is created/run automatically on
// every Orca launch; the Connect button provisions immediately, and each
// "New sync URL" mints a fresh persistent pairing link for another phone.
export function CloudflareRelaySection(): React.JSX.Element {
  const savedToken = useAppStore((s) => s.settings?.cloudflareRelayToken ?? '')
  const savedDomain = useAppStore((s) => s.settings?.cloudflareRelayDomain ?? '')
  const hostname = useAppStore((s) => s.settings?.cloudflareRelayHostname ?? '')
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [token, setToken] = useState(savedToken)
  const [domain, setDomain] = useState(savedDomain)
  const [connecting, setConnecting] = useState(false)
  const [syncUrl, setSyncUrl] = useState<string | null>(null)
  const [syncQr, setSyncQr] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const configured = Boolean(savedToken && savedDomain)

  const persistForm = useCallback((): void => {
    if (token !== savedToken || domain !== savedDomain) {
      void updateSettings({ cloudflareRelayToken: token, cloudflareRelayDomain: domain })
      setSyncUrl(null)
      setSyncQr(null)
    }
  }, [token, domain, savedToken, savedDomain, updateSettings])

  const connect = async (): Promise<void> => {
    persistForm()
    setConnecting(true)
    try {
      // Why: the main process provisions (create tunnel + DNS) and spawns
      // cloudflared immediately; the endpoint is auto-advertised for pairing.
      const result = await window.api.mobile.setCloudflareRelay(true)
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to connect Cloudflare relay')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to connect Cloudflare relay')
    } finally {
      setConnecting(false)
    }
  }

  // Why: every "New sync URL" rotates the pairing credential so multiple phones
  // can each get their own persistent link — old ones keep working.
  const generateSyncUrl = async (): Promise<void> => {
    const endpoint = hostname || `wss://${token ? '…' : ''}${domain}`
    if (!hostname) {
      toast.error('Tunnel is not active yet — click Connect first.')
      return
    }
    setGenerating(true)
    try {
      const result = await window.api.mobile.getPairingQR({
        address: endpoint,
        rotate: true
      })
      if (!result.available) {
        toast.error('Pairing is unavailable right now.')
        return
      }
      setSyncUrl(result.pairingUrl)
      setSyncQr(result.qrDataUrl ?? null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate sync URL')
    } finally {
      setGenerating(false)
    }
  }

  const copySyncUrl = async (): Promise<void> => {
    if (!syncUrl) {
      return
    }
    try {
      await window.api.ui.writeClipboardText(syncUrl)
      toast.success('Sync URL copied')
    } catch {
      toast.error('Failed to copy')
    }
  }

  // Why: when the relay comes up while this pane is open (Connect), surface the
  // sync URL immediately so the user never has to hunt for it.
  useEffect(() => {
    if (hostname && configured && !syncUrl) {
      void generateSyncUrl()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostname, configured])

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <CloudCog className="size-4 text-muted-foreground" aria-hidden />
          {translate(
            'auto.components.settings.CloudflareRelaySection.title',
            'Cloudflare Relay'
          )}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.CloudflareRelaySection.overview',
            'Self-hosted persistent tunnel: each machine gets its own wss://orca-<id>.<domain> endpoint, created and run by Orca itself. Replaces Orca Cloud relay.'
          )}
        </p>
      </div>

      <div className="grid gap-2">
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onBlur={persistForm}
          placeholder={translate(
            'auto.components.settings.CloudflareRelaySection.tokenPlaceholder',
            'Cloudflare API token (Account-Tunnel:Edit, Zone-DNS:Edit)'
          )}
          aria-label={translate(
            'auto.components.settings.CloudflareRelaySection.tokenLabel',
            'Cloudflare API token'
          )}
        />
        <Input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          onBlur={persistForm}
          placeholder={translate(
            'auto.components.settings.CloudflareRelaySection.domainPlaceholder',
            'your-domain.com'
          )}
          aria-label={translate(
            'auto.components.settings.CloudflareRelaySection.domainLabel',
            'Domain on Cloudflare'
          )}
        />
      </div>

      <Button
        type="button"
        variant={hostname ? 'secondary' : 'default'}
        className="w-fit"
        disabled={connecting || !token || !domain}
        onClick={() => void connect()}
      >
        {connecting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Link2 className="size-4" aria-hidden />
        )}
        {hostname
          ? translate(
              'auto.components.settings.CloudflareRelaySection.reconnect',
              'Reconnect tunnel'
            )
          : translate(
              'auto.components.settings.CloudflareRelaySection.connect',
              'Connect / create persistent tunnel'
            )}
      </Button>

      {hostname ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              {translate('auto.components.settings.CloudflareRelaySection.statusLabel', 'Active:')}{' '}
            </span>
            <code className="font-mono">{hostname}</code>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">
                {translate(
                  'auto.components.settings.CloudflareRelaySection.syncUrlLabel',
                  'Orca sync URL'
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={generating}
                onClick={() => void generateSyncUrl()}
              >
                <RefreshCw className={`size-3.5 ${generating ? 'animate-spin' : ''}`} aria-hidden />
                {translate(
                  'auto.components.settings.CloudflareRelaySection.newSync',
                  'New sync URL'
                )}
              </Button>
            </div>
            {syncUrl ? (
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-background/60 px-2 py-1.5 font-mono text-[11px]">
                  {syncUrl}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-7 shrink-0"
                  onClick={() => void copySyncUrl()}
                  aria-label={translate(
                    'auto.components.settings.CloudflareRelaySection.copyUrl',
                    'Copy sync URL'
                  )}
                >
                  <Copy className="size-3.5" aria-hidden />
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.CloudflareRelaySection.genHint',
                  'Generate a sync URL and scan it from Orca Mobile. Each phone gets its own persistent link.'
                )}
              </p>
            )}
            {syncQr ? (
              <div className="flex justify-center rounded-lg bg-white p-3">
                <img
                  src={syncQr}
                  alt={translate(
                    'auto.components.settings.CloudflareRelaySection.qrAlt',
                    'Orca sync QR code'
                  )}
                  className="size-48"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {translate(
            'auto.components.settings.CloudflareRelaySection.note',
            'Needs the cloudflared binary installed (or ORCA_CLOUDFLARED_PATH set). The tunnel is created and kept running automatically while Orca is on.'
          )}
        </span>
      </p>
    </section>
  )
}
