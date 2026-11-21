import { useState } from 'react'
import { Database, ExternalLink, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IntegrationCardDetails, IntegrationCardShell } from './presentation/integration-card-shell'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'

export function TursoIntegrationCard(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const tursoDatabaseUrl = settings?.tursoDatabaseUrl ?? ''
  const tursoAuthToken = settings?.tursoAuthToken ?? ''
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [showToken, setShowToken] = useState(false)

  const configured = tursoDatabaseUrl.trim() !== '' && tursoAuthToken.trim() !== ''

  return (
    <IntegrationCardShell
      icon={<Database className="size-5" />}
      name="Turso"
      description={
        configured
          ? tursoDatabaseUrl
          : translate(
              'auto.components.settings.turso.integration.card.description',
              'Store synced snippets in your Turso (libSQL) database.'
            )
      }
      statusTone={configured ? 'connected' : 'neutral'}
      statusLabel={
        configured
          ? translate('auto.components.settings.turso.integration.card.connected', 'Connected')
          : translate('auto.components.settings.turso.integration.card.notConfigured', 'Not set up')
      }
    >
      <IntegrationCardDetails>
        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-foreground">
              {translate('auto.components.settings.turso.integration.card.dbUrl', 'Database URL')}
            </span>
            <Input
              value={tursoDatabaseUrl}
              onChange={(e) => void updateSettings({ tursoDatabaseUrl: e.target.value })}
              placeholder="libsql://your-db.turso.io"
              className="h-7 font-mono text-xs"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-foreground">
              {translate('auto.components.settings.turso.integration.card.authToken', 'Auth token')}
            </span>
            <div className="relative">
              <Input
                type={showToken ? 'text' : 'password'}
                value={tursoAuthToken}
                onChange={(e) => void updateSettings({ tursoAuthToken: e.target.value })}
                placeholder="eyJ…"
                className="h-7 pr-8 font-mono text-xs"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowToken((v) => !v)}
                aria-label={
                  showToken
                    ? translate(
                        'auto.components.settings.turso.integration.card.hideToken',
                        'Hide token'
                      )
                    : translate(
                        'auto.components.settings.turso.integration.card.showToken',
                        'Show token'
                      )
                }
              >
                {showToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(event) =>
              openAppHttpLink('https://docs.turso.net/cloud/get-started', { event })
            }
          >
            <ExternalLink className="mr-1.5 size-3.5" />
            {translate('auto.components.settings.turso.integration.card.learnMore', 'Learn more')}
          </Button>
        </div>
      </IntegrationCardDetails>
    </IntegrationCardShell>
  )
}
