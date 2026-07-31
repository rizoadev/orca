import { useState } from 'react'
import { CloudCog, Info } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

// Why: self-hosted relay replaces Orca Cloud with a per-machine Cloudflare
// Tunnel. The main process provisions + runs cloudflared on the next launch
// (the WS transport is already bound by the time this pane can apply a toggle).
export function CloudflareRelaySection(): React.JSX.Element {
  const enabled = useAppStore((s) => s.settings?.cloudflareRelayEnabled === true)
  const savedToken = useAppStore((s) => s.settings?.cloudflareRelayToken ?? '')
  const savedDomain = useAppStore((s) => s.settings?.cloudflareRelayDomain ?? '')
  const hostname = useAppStore((s) => s.settings?.cloudflareRelayHostname ?? '')
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [token, setToken] = useState(savedToken)
  const [domain, setDomain] = useState(savedDomain)

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <CloudCog className="size-4 text-muted-foreground" aria-hidden />
            {translate('auto.components.settings.CloudflareRelaySection.title', 'Cloudflare Relay')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.CloudflareRelaySection.overview',
              'Self-hosted relay: each machine gets a persistent wss://orca-<id>.<domain> tunnel, run by the app itself. Replaces Orca Cloud relay.'
            )}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={translate(
            'auto.components.settings.CloudflareRelaySection.toggleLabel',
            'Enable Cloudflare relay'
          )}
          onClick={() => void updateSettings({ cloudflareRelayEnabled: !enabled })}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors ${
            enabled ? 'bg-foreground' : 'bg-muted-foreground/30'
          } outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50`}
        >
          <span
            className={`pointer-events-none block size-3.5 rounded-full bg-background shadow-sm transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {enabled ? (
        <>
          <div className="grid gap-2">
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onBlur={() => {
                if (token !== savedToken) {
                  void updateSettings({ cloudflareRelayToken: token })
                }
              }}
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
              onBlur={() => {
                if (domain !== savedDomain) {
                  void updateSettings({ cloudflareRelayDomain: domain })
                }
              }}
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
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {translate(
                'auto.components.settings.CloudflareRelaySection.note',
                'Applies on the next Orca start. Needs the cloudflared binary installed (or ORCA_CLOUDFLARED_PATH set).'
              )}
            </span>
          </p>
          {hostname ? (
            <div className="rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
              <span className="text-muted-foreground">
                {translate(
                  'auto.components.settings.CloudflareRelaySection.statusLabel',
                  'Active:'
                )}{' '}
              </span>
              <code className="font-mono">{hostname}</code>
            </div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => {
              // Why: the provisioning path only runs at startup; a manual restart
              // is the cheapest reliable way to re-provision after edits.
              void window.api.app.relaunch()
            }}
          >
            {translate(
              'auto.components.settings.CloudflareRelaySection.restart',
              'Restart to apply'
            )}
          </Button>
        </>
      ) : null}
    </section>
  )
}
