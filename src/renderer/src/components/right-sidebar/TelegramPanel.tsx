import { useEffect, useRef } from 'react'
import { MessageCircle } from 'lucide-react'
import { ORCA_BROWSER_PARTITION } from '../../../../shared/constants'
import { ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE } from '../../../../shared/browser-guest-web-preferences'

const TELEGRAM_WEB_URL = 'https://web.telegram.org/k/'

type TelegramWebview = Electron.WebviewTag & {
  loadURL?: (url: string) => Promise<void>
  remove?: () => void
}

export function TelegramPanel(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const webviewRef = useRef<TelegramWebview | null>(null)
  const isPairedWebClient =
    (globalThis as { __ORCA_WEB_CLIENT__?: boolean }).__ORCA_WEB_CLIENT__ === true

  useEffect(() => {
    const container = containerRef.current
    if (!container || isPairedWebClient) {
      return
    }

    const webview = document.createElement('webview') as TelegramWebview
    // Use the real initial URL instead of loading a blank guest and then calling
    // loadURL from dom-ready; Electron reports Telegram's redirect replacement
    // as ERR_ABORTED through the guest-view manager even when navigation works.
    webview.setAttribute('src', TELEGRAM_WEB_URL)
    webview.setAttribute('partition', ORCA_BROWSER_PARTITION)
    webview.setAttribute('allowpopups', '')
    webview.setAttribute('webpreferences', ORCA_BROWSER_GUEST_WEB_PREFERENCES_ATTRIBUTE)
    webview.style.display = 'flex'
    webview.style.width = '100%'
    webview.style.height = '100%'
    webview.style.border = 'none'
    const onDidFailLoad = (event: { errorCode?: number; isMainFrame?: boolean }): void => {
      // Telegram may replace its initial document during auth/bootstrap. Do not
      // surface that normal redirect race as an Orca panel error.
      if (event.isMainFrame !== false && event.errorCode !== -3) {
        webview.dataset.loadError = 'true'
      }
    }
    webview.addEventListener('did-fail-load', onDidFailLoad)
    container.appendChild(webview)
    webviewRef.current = webview

    return () => {
      webview.removeEventListener('did-fail-load', onDidFailLoad)
      webview.remove()
      webviewRef.current = null
    }
  }, [isPairedWebClient])

  if (isPairedWebClient) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground">
        <MessageCircle className="size-5" />
        <p>Telegram Web is available in the Orca desktop app.</p>
      </div>
    )
  }

  return <div ref={containerRef} className="h-full min-h-0 w-full overflow-hidden bg-background" />
}

export default TelegramPanel
