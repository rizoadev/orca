/**
 * Settings → Integrations → Turso connect dialog: enter database URL + auth token.
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
import type { NotesSyncStatus } from '../../../../shared/notes-sync-types'

type TursoConnectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Current stored config so the dialog can prefill on "update". */
  initialDbUrl?: string
  onConnected?: (status: NotesSyncStatus) => void
  overlayClassName?: string
  contentClassName?: string
}

export function TursoConnectDialog({
  open,
  onOpenChange,
  initialDbUrl = '',
  onConnected,
  overlayClassName,
  contentClassName
}: TursoConnectDialogProps): React.JSX.Element {
  // Why: token is a secret — never prefill it from stored config; only URL is
  // shown for the "update" case.
  const [dbUrl, setDbUrl] = useState(initialDbUrl)
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = async (): Promise<void> => {
    const url = dbUrl.trim()
    if (!url || !token.trim()) {
      setError(
        translate(
          'auto.components.settings.turso.connect.required',
          'Both database URL and auth token are required.'
        )
      )
      return
    }
    setConnecting(true)
    setError(null)
    try {
      // Why: persist config first so testConnection/syncNow see it.
      await window.api.notes.setSyncConfig({
        provider: 'turso',
        tursoDbUrl: url,
        tursoAuthToken: token.trim()
      })
      const test = await window.api.notes.testConnection()
      if (!test.ok) {
        setError(
          translate(
            'auto.components.settings.turso.connect.testFailed',
            'Could not connect to the Turso database.'
          ) + (test.error ? ` ${test.error}` : '')
        )
        setConnecting(false)
        return
      }
      // Why: kick an initial sync so the user sees remote notes immediately.
      await window.api.notes.syncNow().catch(() => {})
      const status = await window.api.notes.syncStatus()
      toast.success(translate('auto.components.settings.turso.connect.connected', 'Connected to Turso'))
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
            {translate('auto.components.settings.turso.connect.title', 'Connect Turso')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.turso.connect.description',
              'Enter your Turso database URL and an auth token with read/write access so Orca can sync notes.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="turso-db-url">
              {translate(
                'auto.components.settings.turso.connect.dbUrlLabel',
                'Database URL'
              )}
            </Label>
            <Input
              id="turso-db-url"
              value={dbUrl}
              onChange={(event) => setDbUrl(event.target.value)}
              placeholder="libsql://mydb-org.turso.io"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="turso-token">
              {translate('auto.components.settings.turso.connect.tokenLabel', 'Auth token')}
            </Label>
            <Input
              id="turso-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="eyJ..."
              className="font-mono text-xs"
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={connecting}>
            {translate('auto.components.settings.turso.connect.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void handleConnect()} disabled={connecting}>
            {connecting ? (
              <>
                <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                {translate('auto.components.settings.turso.connect.connecting', 'Connecting…')}
              </>
            ) : (
              translate('auto.components.settings.turso.connect.confirm', 'Connect')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}