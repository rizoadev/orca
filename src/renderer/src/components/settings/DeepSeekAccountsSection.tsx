import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { DeepSeekIcon } from '@/components/status-bar/icons'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useAppStore } from '../../store'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { clampUsedPercent } from '../../../../shared/usage-percentage-display'

const DEEPSEEK_API_DOCS_URL = 'https://api.deepseek.com/'

export function DeepSeekAccountsSection(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const refreshRateLimits = useAppStore((s) => s.refreshRateLimits)
  const deepseekUsage = useAppStore((s) => s.rateLimits.deepseek)

  const [refreshing, setRefreshing] = useState(false)

  const apiKey = settings?.deepseekApiKey ?? ''
  const isConfigured = Boolean(apiKey?.trim())

  const handleRefreshUsage = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      await refreshRateLimits()
    } finally {
      setRefreshing(false)
    }
  }, [refreshRateLimits])

  // Why: reflect the latest usage snapshot timestamp without polling — the store
  // updates on refresh cycles, so re-render when the snapshot changes.
  useEffect(() => {
    void deepseekUsage
  }, [deepseekUsage?.updatedAt])

  const usageWindow = deepseekUsage?.session ?? deepseekUsage?.weekly ?? null
  const usedPercent = usageWindow ? clampUsedPercent(usageWindow.usedPercent) : null
  const isFetching = deepseekUsage?.status === 'fetching'

  return (
    <section id="accounts-deepseek" className="space-y-4 scroll-mt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <DeepSeekIcon size={16} />
            {translate('auto.components.settings.DeepSeekAccountsSection.4d8e2a1b3c', 'DeepSeek')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.DeepSeekAccountsSection.b3f9c7d2e1',
              'Shows balance and package usage from your DeepSeek API key.'
            )}
          </p>
        </div>
        <a
          href={DEEPSEEK_API_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {translate(
            'auto.components.settings.DeepSeekAccountsSection.8f0a7d2e1b',
            'DeepSeek API docs'
          )}
          <ExternalLink className="size-3" />
        </a>
      </div>

      <SearchableSetting
        title={translate(
          'auto.components.settings.DeepSeekAccountsSection.b69f9d4c1a',
          'DeepSeek API key'
        )}
        description={translate(
          'auto.components.settings.DeepSeekAccountsSection.7e3c5a2f0d',
          'Paste your DeepSeek API key (sk-…) for rate limit and balance fetching.'
        )}
        keywords={['deepseek', 'api key', 'dk', 'rate limit', 'usage', 'status bar']}
        className="space-y-2"
      >
        <Label>
          {translate(
            'auto.components.settings.DeepSeekAccountsSection.b69f9d4c1a',
            'DeepSeek API key'
          )}
        </Label>
        <div className="flex gap-2">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => {
              void updateSettings({ deepseekApiKey: e.target.value })
            }}
            placeholder={translate(
              'auto.components.settings.DeepSeekAccountsSection.c0d1e3b5a7',
              'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxx'
            )}
            spellCheck={false}
            className="flex-1 text-xs"
          />
          {apiKey && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                void updateSettings({ deepseekApiKey: '' })
              }}
              className="h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              {translate('auto.components.settings.AccountsPane.b398b834c9', 'Clear')}
            </Button>
          )}
        </div>
      </SearchableSetting>

      <div
        className={cn(
          'flex items-start gap-3 rounded-lg border bg-muted/20 p-3',
          isConfigured ? 'border-border/60' : 'border-border/40'
        )}
      >
        <ShieldCheck
          className={cn(
            'mt-0.5 size-4 shrink-0',
            isConfigured ? 'text-foreground' : 'text-muted-foreground'
          )}
        />
        <div className="min-w-0 flex-1 space-y-1">
          {isFetching ? (
            <p className="text-xs text-muted-foreground">
              {translate('auto.components.settings.DeepSeekAccountsSection.ad47a33f72', 'Loading…')}
            </p>
          ) : usageWindow && usedPercent !== null ? (
            <>
              <p className="truncate text-xs font-medium">
                {usedPercent}%{' '}
                {translate('auto.components.settings.DeepSeekAccountsSection.f9a2b3c4d5', 'used')}
              </p>
              {deepseekUsage?.error ? (
                <p className="text-xs text-destructive">{deepseekUsage.error}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'auto.components.settings.DeepSeekAccountsSection.b7e2d9f0a3',
                    'Same usage as the DeepSeek status bar.'
                  )}
                </p>
              )}
            </>
          ) : isConfigured ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.DeepSeekAccountsSection.7c8d9e0f1a',
                'Click Refresh usage to fetch balance and package usage.'
              )}
            </p>
          ) : (
            <p className="text-xs font-medium">
              {translate(
                'auto.components.settings.DeepSeekAccountsSection.e5f6a7b8c9',
                'DeepSeek API key not configured'
              )}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="xs"
          disabled={refreshing || !isConfigured}
          onClick={() => void handleRefreshUsage()}
          className="shrink-0 gap-1"
        >
          {refreshing ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
          {translate(
            'auto.components.settings.DeepSeekAccountsSection.3325d996cb',
            'Refresh usage'
          )}
        </Button>
      </div>
    </section>
  )
}
