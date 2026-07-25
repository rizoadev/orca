/**
 * Asana Personal Access Token connect dialog.
 */
import { useState } from 'react'
import { ExternalLink, LoaderCircle } from 'lucide-react'
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
import type { AsanaConnectionStatus } from '../../../shared/asana-types'

type AsanaConnectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected?: (status: AsanaConnectionStatus) => void
}

export function AsanaConnectDialog({
  open,
  onOpenChange,
  onConnected
}: AsanaConnectDialogProps): React.JSX.Element {
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = async (): Promise<void> => {
    if (!token.trim()) {
      setError('Personal Access Token is required.')
      return
    }
    setConnecting(true)
    setError(null)
    try {
      const status = await window.api.asana.connect({ personalAccessToken: token.trim() })
      toast.success(
        translate(
          'auto.components.AsanaConnectDialog.connected',
          'Connected to Asana as {name}',
          { name: status.viewer?.name ?? 'user' }
        )
      )
      setToken('')
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.AsanaConnectDialog.title', 'Connect Asana')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.AsanaConnectDialog.description',
              'Paste a Personal Access Token from Asana Settings → Apps → Personal access tokens.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="asana-pat">
              {translate('auto.components.AsanaConnectDialog.tokenLabel', 'Personal Access Token')}
            </Label>
            <Input
              id="asana-pat"
              type="password"
              autoFocus
              placeholder="1/…"
              value={token}
              disabled={connecting}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && token.trim()) {
                  void handleConnect()
                }
              }}
            />
          </div>
          <a
            href="https://app.asana.com/0/my-apps"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.preventDefault()
              void window.api.shell.openUrl('https://app.asana.com/0/my-apps')
            }}
          >
            <ExternalLink className="size-3" />
            {translate(
              'auto.components.AsanaConnectDialog.openSettings',
              'Open Asana app settings'
            )}
          </a>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={connecting} onClick={() => onOpenChange(false)}>
            {translate('auto.components.AsanaConnectDialog.cancel', 'Cancel')}
          </Button>
          <Button disabled={!token.trim() || connecting} onClick={() => void handleConnect()}>
            {connecting ? <LoaderCircle className="mr-2 size-3.5 animate-spin" /> : null}
            {translate('auto.components.AsanaConnectDialog.connect', 'Connect')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
