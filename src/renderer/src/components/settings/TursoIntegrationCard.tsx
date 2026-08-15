/**
 * Settings → Integrations card for Turso notes sync (database URL + auth token).
 */
import { useCallback, useEffect, useState } from 'react'
import { Database, LoaderCircle, Unlink } from 'lucide-react'
import { TursoConnectDialog } from './TursoConnectDialog'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import type { NotesSyncStatus } from '../../../../shared/notes-sync-types'
import { integrationCardStatus } from './turso-integration-status'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'

export function TursoIntegrationCard(): React.JSX.Element {
  const mountedRef = useMountedRef()
  const [status, setStatus] = useState<NotesSyncStatus | null>(null)
  const [checked, setChecked] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dbUrl, setDbUrl] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.notes.syncStatus()
      if (!mountedRef.current) {
        return
      }
      setStatus(next)
      const config = await window.api.notes.syncConfig().catch(() => null)
      if (mountedRef.current) {
        setDbUrl(config?.tursoDbUrl ?? '')
      }
    } catch {
      // non-fatal
    } finally {
      if (mountedRef.current) {
        setChecked(true)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const checking = !checked
  const { connected, labeled } = integrationCardStatus(status, checked)
  const invalid = status && !connected

  const handleDisconnect = async (): Promise<void> => {
    await window.api.notes.setSyncConfig({ provider: null }).catch(() => {})
    await refresh()
  }

  return (
    <IntegrationCardShell
      icon={<Database className="size-5" />}
      name="Turso"
      description={
        checking
          ? translate('auto.components.settings.turso.checking', 'Checking Turso access…')
          : connected
            ? translate(
                'auto.components.settings.turso.connectedDesc',
                'Syncing notes to {db}',
                { db: dbUrl || 'Turso' }
              )
            : translate(
                'auto.components.settings.turso.notConnectedDesc',
                'Connect a Turso database to back up and sync notes.'
              )
      }
      checking={checking}
      statusTone={connected ? 'connected' : invalid ? 'attention' : 'neutral'}
      statusLabel={labeled}
      actions={
        !checking ? (
          <Button
            variant={connected ? 'outline' : 'default'}
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            {connected
              ? translate('auto.components.settings.turso.update', 'Update')
              : translate('auto.components.settings.turso.connect', 'Connect Turso')}
          </Button>
        ) : null
      }
    >
      <IntegrationCardDetails>
        {connected ? (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {dbUrl || translate('auto.components.settings.turso.connectedDb', 'Turso')}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.turso.syncHint',
                  'Notes autosync to this database. Edit or rotate your token anytime.'
                )}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              {translate('auto.components.settings.turso.update', 'Update')}
            </Button>
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              aria-label={translate('auto.components.settings.turso.disconnectAria', 'Disconnect Turso')}
              className="rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
            >
              <Unlink className="size-3.5" />
            </button>
          </div>
        ) : !checking ? (
          <>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.turso.setupHint',
                'Create a database in the Turso dashboard, then generate a read/write auth token. Enter both here; the token is stored encrypted locally.'
              )}
            </p>
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              <LoaderCircle className="mr-1.5 size-3.5" />
              {translate('auto.components.settings.turso.recheck', 'Re-check')}
            </Button>
          </>
        ) : null}
      </IntegrationCardDetails>

      <TursoConnectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialDbUrl={dbUrl}
        onConnected={(next) => {
          setStatus(next)
          void refresh()
        }}
      />
    </IntegrationCardShell>
  )
}