/**
 * CloudflareRuntimeHint — inject ke runtime-share-computer-button.tsx.
 * Muncul di dialog "Share this computer" jika Cloudflare tunnel aktif.
 * Klik "Pakai" → copy wss URL ke clipboard, user paste ke Custom Address.
 */
import { Cloud } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'

type Props = {
  onUse: (address: string) => void
}

export function CloudflareRuntimeHint({ onUse }: Props): React.JSX.Element | null {
  const hostname = useAppStore((s) => s.settings?.cloudflareRelayHostname ?? '')
  if (!hostname) {
    return null
  }
  const wssUrl = hostname.startsWith('wss://') ? hostname : `wss://${hostname}`
  const handleUse = (): void => {
    void window.api.ui
      .writeClipboardText(wssUrl)
      .then(() => {
        toast.success(`Copied ${wssUrl} — paste into Custom Address`)
      })
      .catch(() => {
        toast.error('Failed to copy tunnel URL')
      })
    onUse(wssUrl)
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
      <Cloud className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate text-muted-foreground">
        Cloudflare tunnel: <code className="font-mono text-foreground">{wssUrl}</code>
      </span>
      <button
        type="button"
        className="ml-auto shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
        onClick={handleUse}
      >
        Copy
      </button>
    </div>
  )
}
