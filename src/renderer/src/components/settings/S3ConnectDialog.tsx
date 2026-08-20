/**
 * Settings → Integrations → S3 connect dialog: endpoint, bucket, credentials.
 */
import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import type { S3ConnectionStatus } from '../../../../shared/s3-types'

type S3ConnectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected?: (status: S3ConnectionStatus) => void
  overlayClassName?: string
  contentClassName?: string
}

export function S3ConnectDialog({
  open,
  onOpenChange,
  onConnected,
  overlayClassName,
  contentClassName
}: S3ConnectDialogProps): React.JSX.Element {
  const [endpoint, setEndpoint] = useState('')
  const [region, setRegion] = useState('')
  const [bucket, setBucket] = useState('')
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [forcePathStyle, setForcePathStyle] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Why: never prefill secrets on reopen; only the non-secret fields persist
  // through status so users don't retype everything on rotation.
  const handleConnect = async (): Promise<void> => {
    if (!window.api.s3?.testConnection) {
      setError(
        translate(
          'auto.components.settings.s3.connect.desktopOnly',
          'S3 uploads are only available in the desktop app.'
        )
      )
      return
    }
    if (!endpoint.trim() || !bucket.trim() || !accessKeyId.trim() || !secretAccessKey.trim()) {
      setError(
        translate(
          'auto.components.settings.s3.connect.required',
          'Endpoint, bucket, access key, and secret key are required.'
        )
      )
      return
    }
    setConnecting(true)
    setError(null)
    try {
      const config = {
        endpoint: endpoint.trim(),
        region: region.trim() || 'us-east-1',
        bucket: bucket.trim(),
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
        forcePathStyle
      }
      const test = await window.api.s3.testConnection(config)
      if (!test.ok) {
        setError(
          translate(
            'auto.components.settings.s3.connect.testFailed',
            'Could not connect to the S3 bucket.'
          ) + (test.error ? ` ${test.error}` : '')
        )
        setConnecting(false)
        return
      }
      const status = await window.api.s3.connect(config)
      toast.success(translate('auto.components.settings.s3.connect.connected', 'Connected to S3'))
      onOpenChange(false)
      onConnected?.(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName} overlayClassName={overlayClassName}>
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.settings.s3.connect.title', 'Connect S3')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.s3.connect.description',
              'Enter your S3-compatible storage endpoint and credentials so Orca can upload large files from the explorer.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="s3-endpoint">
              {translate('auto.components.settings.s3.connect.endpointLabel', 'Endpoint')}
            </Label>
            <Input
              id="s3-endpoint"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://s3.amazonaws.com or https://minio.local:9000"
              className="font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s3-region">
                {translate('auto.components.settings.s3.connect.regionLabel', 'Region')}
              </Label>
              <Input
                id="s3-region"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder="us-east-1"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s3-bucket">
                {translate('auto.components.settings.s3.connect.bucketLabel', 'Bucket')}
              </Label>
              <Input
                id="s3-bucket"
                value={bucket}
                onChange={(event) => setBucket(event.target.value)}
                placeholder="my-backups"
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s3-access-key">
              {translate('auto.components.settings.s3.connect.accessKeyLabel', 'Access key ID')}
            </Label>
            <Input
              id="s3-access-key"
              value={accessKeyId}
              onChange={(event) => setAccessKeyId(event.target.value)}
              placeholder="AKIA..."
              className="font-mono text-xs"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s3-secret-key">
              {translate('auto.components.settings.s3.connect.secretKeyLabel', 'Secret access key')}
            </Label>
            <Input
              id="s3-secret-key"
              type="password"
              value={secretAccessKey}
              onChange={(event) => setSecretAccessKey(event.target.value)}
              placeholder="••••••••••••"
              className="font-mono text-xs"
              autoComplete="new-password"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={forcePathStyle}
              onChange={(event) => setForcePathStyle(event.target.checked)}
              className="size-3.5"
            />
            {translate(
              'auto.components.settings.s3.connect.forcePathStyle',
              'Force path-style URLs (MinIO, R2, and other custom endpoints)'
            )}
          </label>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={connecting}>
            {translate('auto.components.settings.s3.connect.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void handleConnect()} disabled={connecting}>
            {connecting ? (
              <>
                <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                {translate('auto.components.settings.s3.connect.connecting', 'Connecting…')}
              </>
            ) : (
              translate('auto.components.settings.s3.connect.confirm', 'Connect')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
