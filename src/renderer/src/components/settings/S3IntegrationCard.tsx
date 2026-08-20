/**
 * Settings → Integrations card for S3-compatible object storage (explorer uploads).
 */
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, HardDrive, LoaderCircle, Unlink } from 'lucide-react'
import { S3ConnectDialog } from './S3ConnectDialog'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import type { S3ConnectionStatus } from '../../../../shared/s3-types'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'

export function S3IntegrationCard(): React.JSX.Element {
  const mountedRef = useMountedRef()
  const [status, setStatus] = useState<S3ConnectionStatus | null>(null)
  const [checked, setChecked] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ state: 'ok' | 'error'; error?: string } | null>(
    null
  )

  const refresh = useCallback(async (): Promise<void> => {
    if (!window.api.s3?.getStatus) {
      if (mountedRef.current) {
        setStatus({ connected: false, endpoint: null, region: null, bucket: null })
        setChecked(true)
      }
      return
    }
    try {
      const next = await window.api.s3.getStatus()
      if (!mountedRef.current) {
        return
      }
      setStatus(next)
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

  const connected = Boolean(status?.connected)
  const checking = !checked

  const handleDisconnect = async (): Promise<void> => {
    if (!window.api.s3?.disconnect) {
      await refresh()
      return
    }
    try {
      const next = await window.api.s3.disconnect()
      if (!mountedRef.current) {
        return
      }
      setStatus(next)
      setTestResult(null)
    } catch {
      await refresh()
    }
  }

  // Why: explicit user-triggered verification so we don't hit the bucket on every settings open.
  const handleTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      if (!window.api.s3?.testConnection) {
        throw new Error(
          translate(
            'auto.components.settings.s3.desktopOnly',
            'S3 uploads are only available in the desktop app.'
          )
        )
      }
      const next = await window.api.s3.testConnection()
      if (!mountedRef.current) {
        return
      }
      if (next.ok) {
        setTestResult({ state: 'ok' })
      } else {
        setTestResult({ state: 'error', error: next.error })
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

  const bucketLabel = status?.bucket ?? ''
  const endpointLabel = status?.endpoint ?? ''

  return (
    <IntegrationCardShell
      icon={<HardDrive className="size-5" />}
      name="S3"
      description={
        checking
          ? translate('auto.components.settings.s3.checking', 'Checking S3 access…')
          : connected
            ? translate('auto.components.settings.s3.connectedDesc', 'Connected to {bucket}', {
                bucket: bucketLabel || 'S3'
              })
            : translate(
                'auto.components.settings.s3.notConnectedDesc',
                'Connect an S3-compatible bucket to upload large files from the explorer.'
              )
      }
      checking={checking}
      statusTone={connected ? 'connected' : status?.credentialError ? 'attention' : 'neutral'}
      statusLabel={
        connected
          ? translate('auto.components.settings.s3.status.connected', 'Connected')
          : status?.credentialError
            ? translate('auto.components.settings.s3.status.error', 'Error')
            : checked
              ? translate('auto.components.settings.s3.status.notConnected', 'Not connected')
              : translate('auto.components.settings.s3.status.checking', 'Checking')
      }
      actions={
        !checking ? (
          <Button
            variant={connected ? 'outline' : 'default'}
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            {connected
              ? translate('auto.components.settings.s3.update', 'Update')
              : translate('auto.components.settings.s3.connect', 'Connect S3')}
          </Button>
        ) : null
      }
    >
      <IntegrationCardDetails>
        {connected ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {endpointLabel || 'S3'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {translate(
                    'auto.components.settings.s3.bucketHint',
                    'Bucket: {bucket} · Region: {region}',
                    { bucket: bucketLabel, region: status?.region ?? 'us-east-1' }
                  )}
                </p>
              </div>
              {testResult?.state === 'ok' ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-status-success">
                  <CheckCircle2 className="size-3.5" />
                  {translate('auto.components.settings.s3.verified', 'Verified')}
                </span>
              ) : null}
              {testResult?.state === 'error' ? (
                <span className="flex min-w-0 max-w-[220px] shrink items-center gap-1 truncate text-xs text-destructive">
                  <span className="truncate">{testResult.error}</span>
                </span>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleTest()}
                disabled={testing}
              >
                {testing ? (
                  <>
                    <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                    {translate('auto.components.settings.s3.testing', 'Testing…')}
                  </>
                ) : (
                  translate('auto.components.settings.s3.test', 'Test')
                )}
              </Button>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                aria-label={translate(
                  'auto.components.settings.s3.disconnectAria',
                  'Disconnect S3'
                )}
                className="rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
              >
                <Unlink className="size-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground/70">
              {translate(
                'auto.components.settings.s3.tokenHint',
                'Credentials are stored encrypted for this machine under ~/.orca/s3-config.enc.'
              )}
            </p>
          </div>
        ) : !checking ? (
          <>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.s3.setupHint',
                'Use any S3-compatible storage: AWS S3, MinIO, Cloudflare R2, or a self-hosted endpoint. Enter the bucket and credentials; the secret key is stored encrypted locally.'
              )}
            </p>
            {status?.credentialError ? (
              <p className="text-xs text-destructive">{status.credentialError}</p>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              {translate('auto.components.settings.s3.recheck', 'Re-check')}
            </Button>
          </>
        ) : null}
      </IntegrationCardDetails>

      <S3ConnectDialog
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
