import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useYouTubePlayerStore } from './youtube-player-store'
import { ORCA_BROWSER_PARTITION } from '../../../../shared/constants'

// Why: player pinned at the bottom of the right sidebar so it stays visible
// across all sidebar tabs (Explorer, Source Control, Issues, …). Drag the
// handle to resize. Mirrors the useCheckDetailsResize drag pattern.
const DEFAULT_PLAYER_HEIGHT = 220
const MIN_PLAYER_HEIGHT = 100
const MAX_PLAYER_HEIGHT = 460

type WebviewLike = {
  loadURL?: (url: string) => Promise<void>
  remove?: () => void
} & Partial<Electron.WebviewTag>

export function YouTubePlayerBar(): React.JSX.Element | null {
  const videoId = useYouTubePlayerStore((s) => s.videoId)
  const title = useYouTubePlayerStore((s) => s.title)
  const uploader = useYouTubePlayerStore((s) => s.uploader)
  const open = useYouTubePlayerStore((s) => s.open)
  const close = useYouTubePlayerStore((s) => s.close)

  const [playerHeight, setPlayerHeight] = useState(DEFAULT_PLAYER_HEIGHT)
  const dragStartRef = useRef<{ y: number; height: number } | null>(null)
  const webviewRef = useRef<WebviewLike | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const readyRef = useRef(false)
  const pendingUrlRef = useRef<string | null>(null)

  // Why: create the <webview> imperatively so we control the partition attribute
  // — will-attach-webview in createMainWindow.ts denies any partition not in the
  // browserSessionRegistry allowlist. persist:orca-browser is always allowed.
  // A <webview> also gets its own origin (not file://), which fixes YouTube's
  // Error 153 "Video player configuration error" in packaged builds.
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const webview = document.createElement('webview') as Electron.WebviewTag
    // Why: an initial src is required for Electron to attach the guest process
    // and fire dom-ready. Without it the webview stays inert and loadURL never
    // works. data:text/html is the same blank page Orca's browser pane uses.
    webview.setAttribute('src', 'data:text/html,')
    webview.setAttribute('partition', ORCA_BROWSER_PARTITION)
    webview.setAttribute('allowpopups', '')
    // Why: YouTube blocks embeds when it detects "Electron" in the User-Agent
    // (Error 153). Strip it so the guest looks like a regular Chrome browser.
    const cleanUa = navigator.userAgent.replace(/\s+Electron\/\S+/, '').replace(/(\)\s+)\S+\s+(Chrome\/)/, '$1$2')
    webview.setAttribute('useragent', cleanUa)
    webview.style.display = 'flex'
    webview.style.width = '100%'
    webview.style.height = '100%'
    webview.style.border = 'none'
    webview.style.backgroundColor = '#000'
    container.appendChild(webview)
    webviewRef.current = webview as WebviewLike
    // Why: mark when the guest is ready so loadURL calls don't fire before
    // Electron attaches the guest process (throws "dom-ready" error otherwise).
    const onReady = (): void => {
      readyRef.current = true
      if (pendingUrlRef.current) {
        void (webview as WebviewLike).loadURL?.(pendingUrlRef.current)
        pendingUrlRef.current = null
      }
    }
    webview.addEventListener('dom-ready', onReady)
    return () => {
      webview.removeEventListener('dom-ready', onReady)
      webview.remove?.()
      webviewRef.current = null
      readyRef.current = false
    }
  }, [])

  // Why: load a local HTTP page that embeds YouTube via <iframe>. A real
  // http://127.0.0.1 origin avoids YouTube's Error 153 (null/data: origin
  // rejection). The embed server runs in the main process.
  const [embedPort, setEmbedPort] = useState(0)
  useEffect(() => {
    if (!embedPort) {
      void window.api?.youtube?.embedPort().then(setEmbedPort)
    }
  }, [embedPort])

  useEffect(() => {
    if (!videoId || !open || !embedPort) {
      return
    }
    const wv = webviewRef.current
    if (!wv) {
      return
    }
    const url = `http://127.0.0.1:${embedPort}/embed/${videoId}`
    if (readyRef.current) {
      void wv.loadURL?.(url)
    } else {
      // Why: guest not ready yet — queue the URL; dom-ready handler will load it.
      pendingUrlRef.current = url
    }
  }, [videoId, open, embedPort])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      const start = dragStartRef.current
      if (!start) {
        return
      }
      // Why: dragging up increases height (clientY decreases).
      const next = start.height + (start.y - e.clientY)
      setPlayerHeight(Math.min(MAX_PLAYER_HEIGHT, Math.max(MIN_PLAYER_HEIGHT, next)))
    }
    const onMouseUp = (): void => {
      dragStartRef.current = null
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Why: always render the container (even when closed) so the webview creation
  // effect can attach on first mount — if we return null before render, the
  // container ref is never available and the webview never gets created.
  const visible = open && videoId

  const onResizeStart = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault()
    dragStartRef.current = { y: e.clientY, height: playerHeight }
  }

  return (
    <div
      className="shrink-0 border-t border-sidebar-border bg-black"
      style={{ height: visible ? playerHeight : 0, overflow: 'hidden' }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onResizeStart}
        className="flex h-1.5 cursor-row-resize items-center justify-center bg-sidebar-border hover:bg-primary/40"
      >
        <div className="h-0.5 w-8 rounded-full bg-muted-foreground/30" />
      </div>

      <div className="flex h-[calc(100%-1.5px)] flex-col">
        <div ref={containerRef} style={{ flex: 1, position: 'relative', backgroundColor: '#000' }} />
        {visible ? (
          <div className="flex items-center gap-2 bg-black px-2 py-1">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{title}</p>
              <p className="truncate text-[11px] text-muted-foreground">{uploader}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={close}
                  aria-label="Close player"
                >
                  <X size={13} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Close</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </div>
    </div>
  )
}
