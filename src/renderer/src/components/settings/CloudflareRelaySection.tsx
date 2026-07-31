import { useCallback, useState } from 'react'
import { CloudCog, Info, Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

// Why: Cloudflare Relay — token + domain create and keep a persistent per-machine
// tunnel (systemd service, survives Orca closing). The QR/pairing lives in the
// native "Pair a phone" flow: the tunnel endpoint appears in "This computer's
// address" as the saved custom address once the relay is active.
export function CloudflareRelaySection(): React.JSX.Element {
  const savedToken = useAppStore((s) => s.settings?.cloudflareRelayToken ?? '')
  const savedDomain = useAppStore((s) => s.settings?.cloudflareRelayDomain ?? '')
  const hostname = useAppStore((s) => s.settings?.cloudflareRelayHostname ?? '')
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [token, setToken] = useState(savedToken)
  const [domain, setDomain] = useState(savedDomain)
  const [connecting, setConnecting] = useState(false)

  const persistForm = useCallback((): void => {
    if (token !== savedToken || domain !== savedDomain) {
      void updateSettings({ cloudflareRelayToken: token, cloudflareRelayDomain: domain })
    }
  }, [token, domain, savedToken, savedDomain, updateSettings])

  const connect = async (): Promise<void> => {
    persistForm()
    setConnecting(true)
    try {
      // Why: the main process provisions (create tunnel + DNS) and hands the
      // tunnel to systemd; the endpoint is auto-advertised as the pairing address.
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
        <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">
              {translate('auto.components.settings.CloudflareRelaySection.statusLabel', 'Active:')}{' '}
            </span>
            <code className="font-mono">{hostname}</code>
          </div>
          <p className="text-muted-foreground">
            {translate(
              'auto.components.settings.CloudflareRelaySection.useHint',
              'Now open Pair a phone → This computer’s address and pick the tunnel endpoint, then scan the QR from Orca Mobile.'
            )}
          </p>
        </div>
      ) : null}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {translate(
            'auto.components.settings.CloudflareRelaySection.note',
            'Needs the cloudflared binary installed (or ORCA_CLOUDFLARED_PATH set). The tunnel stays up while Orca is off, until you clear the token here.'
          )}
        </span>
      </p>
    </section>
  )
}
