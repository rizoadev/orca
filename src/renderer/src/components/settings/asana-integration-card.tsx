/**
 * Settings → Integrations card for Asana Personal Access Token connect.
 */
import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, LoaderCircle, Unlink } from 'lucide-react'
import { AsanaConnectDialog } from '@/components/asana-connect-dialog'
import { AsanaIcon } from '@/components/icons/AsanaIcon'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import type { AsanaConnectionStatus } from '../../../../shared/asana-types'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'

export function AsanaIntegrationCard(): React.JSX.Element {
  const mountedRef = useMountedRef()
  const [status, setStatus] = useState<AsanaConnectionStatus | null>(null)
  const [checked, setChecked] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ state: 'ok' | 'error'; error?: string } | null>(
    null
  )
  const subordinateRowClass = useIntegrationSubordinateRowClass('flex items-center gap-3')

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.asana.getStatus()
      if (!mountedRef.current) {
        return
      }
      setStatus(next)
    } catch (err) {
      if (!mountedRef.current) {
        return
      }
      setStatus({
        connected: false,
        viewer: null,
        workspaces: [],
        activeWorkspaceGid: null,
        credentialError: err instanceof Error ? err.message : String(err)
      })
    } finally {
      if (mountedRef.current) {
        setChecked(true)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const connected = Boolean(status?.connected)
  const checking = !checked
  const viewer = status?.viewer
  const workspaces = status?.workspaces ?? []

  const handleDisconnect = async (): Promise<void> => {
    try {
      const next = await window.api.asana.disconnect()
      if (!mountedRef.current) {
        return
      }
      setStatus(next)
      setTestResult(null)
    } catch {
      // ignore — refresh will surface state
      await refresh()
    }
  }

  // Why: explicit user-triggered verification so we don't decrypt/hit Asana on every settings open.
  const handleTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const next = await window.api.asana.getStatus()
      if (!mountedRef.current) {
        return
      }
      setStatus(next)
      if (next.connected && next.viewer) {
        setTestResult({ state: 'ok' })
      } else {
        setTestResult({
          state: 'error',
          error: next.credentialError ?? 'Not connected'
        })
      }
    } catch (err) {
      if (!mountedRef.current) {
        return
      }
      setTestResult({
        state: 'error',
        error: err instanceof Error ? err.message : String(err)
      })
    } finally {
      if (mountedRef.current) {
        setTesting(false)
      }
    }
  }

  return (
    <IntegrationCardShell
      icon={<AsanaIcon className="size-5" />}
      name="Asana"
      description={
        connected
          ? translate(
              'auto.components.settings.asana.integration.connectedDesc',
              'Connected as {name}',
              { name: viewer?.name ?? 'Asana user' }
            )
          : checking
            ? translate(
                'auto.components.settings.asana.integration.checking',
                'Checking Asana access before showing setup actions.'
              )
            : translate(
                'auto.components.settings.asana.integration.notConnectedDesc',
                'Add an Asana Personal Access Token to browse tasks.'
              )
      }
      checking={checking}
      statusTone={connected ? 'connected' : 'attention'}
      statusLabel={connected ? 'Connected' : 'Not connected'}
      actions={
        !checking ? (
          <Button
            variant={connected ? 'outline' : 'default'}
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            {connected
              ? translate(
                  'auto.components.settings.asana.integration.updateToken',
                  'Update token'
                )
              : translate(
                  'auto.components.settings.asana.integration.connect',
                  'Connect Asana'
                )}
          </Button>
        ) : null
      }
    >
      <IntegrationCardDetails>
        {connected ? (
          <div className="space-y-2">
            <div className={subordinateRowClass}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {viewer?.name ?? 'Asana'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {viewer?.email ?? ''}
                  {workspaces.length > 0
                    ? `${viewer?.email ? ' · ' : ''}${workspaces.map((w) => w.name).join(', ')}`
                    : ''}
                </p>
              </div>
              {testResult?.state === 'ok' ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-status-success">
                  <CheckCircle2 className="size-3.5" />
                  {translate(
                    'auto.components.settings.task.tracker.integration.cards.a2c0015fb8',
                    'Verified'
                  )}
                </span>
              ) : null}
              {testResult?.state === 'error' ? (
                <span className="flex min-w-0 max-w-[220px] shrink items-center gap-1 truncate text-xs text-destructive">
                  <AlertCircle className="size-3.5 shrink-0" />
                  <span className="truncate">{testResult.error}</span>
                </span>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => void handleTest()} disabled={testing}>
                {testing ? (
                  <>
                    <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                    {translate(
                      'auto.components.settings.task.tracker.integration.cards.3e7c10d286',
                      'Testing...'
                    )}
                  </>
                ) : (
                  translate(
                    'auto.components.settings.task.tracker.integration.cards.c24e56c532',
                    'Test'
                  )
                )}
              </Button>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                aria-label={translate(
                  'auto.components.settings.asana.integration.disconnectAria',
                  'Disconnect Asana'
                )}
                className="rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
              >
                <Unlink className="size-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              {translate(
                'auto.components.settings.asana.integration.tokenHint',
                'One Personal Access Token is stored encrypted for this machine under ~/.orca/asana-token.enc.'
              )}
            </p>
          </div>
        ) : !checking ? (
          <>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.asana.integration.setupHint',
                'Create a Personal Access Token in Asana → Settings → Apps, then paste it here. Token is stored encrypted locally.'
              )}
            </p>
            {status?.credentialError ? (
              <p className="text-xs text-destructive">{status.credentialError}</p>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              {translate(
                'auto.components.settings.task.tracker.integration.cards.c90f2ef419',
                'Re-check'
              )}
            </Button>
          </>
        ) : null}
      </IntegrationCardDetails>

      <AsanaConnectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConnected={(next) => {
          setStatus(next)
          setTestResult(null)
        }}
        overlayClassName="z-[110]"
        contentClassName="z-[120]"
      />
    </IntegrationCardShell>
  )
}
