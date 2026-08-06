import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useYouTubePlayerStore } from './youtube-player-store'

// Why: player pinned at the bottom of the right sidebar so it stays visible
// across all sidebar tabs (Explorer, Source Control, Issues, …). Drag the
// handle to resize. Mirrors the useCheckDetailsResize drag pattern.
const DEFAULT_PLAYER_HEIGHT = 220
const MIN_PLAYER_HEIGHT = 100
const MAX_PLAYER_HEIGHT = 460

export function YouTubePlayerBar(): React.JSX.Element | null {
  const videoId = useYouTubePlayerStore((s) => s.videoId)
  const title = useYouTubePlayerStore((s) => s.title)
  const uploader = useYouTubePlayerStore((s) => s.uploader)
  const open = useYouTubePlayerStore((s) => s.open)
  const close = useYouTubePlayerStore((s) => s.close)

  const [playerHeight, setPlayerHeight] = useState(DEFAULT_PLAYER_HEIGHT)
  const dragStartRef = useRef<{ y: number; height: number } | null>(null)

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

  if (!open || !videoId) {
    return null
  }

  const onResizeStart = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault()
    dragStartRef.current = { y: e.clientY, height: playerHeight }
  }

  // Why: rel=0 + modestbranding minimizes end-of-video related-video overlay;
  // the official embed has no pre-roll for most videos — no third-party proxy.
  const embedSrc = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`

  return (
    <div
      className="shrink-0 border-t border-sidebar-border bg-black"
      style={{ height: playerHeight }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onResizeStart}
        className="flex h-1.5 cursor-row-resize items-center justify-center bg-sidebar-border hover:bg-primary/40"
      >
        <div className="h-0.5 w-8 rounded-full bg-muted-foreground/30" />
      </div>

      <div className="flex h-[calc(100%-1.5px)] flex-col">
        <div style={{ flex: 1, position: 'relative' }}>
          <iframe
            src={embedSrc}
            title={title}
            style={{ top: 0, left: 0, width: '100%', height: '100%', position: 'absolute', border: 0 }}
            allow="accelerometer *; clipboard-write *; encrypted-media *; gyroscope *; picture-in-picture *; web-share *;"
            referrerPolicy="strict-origin"
            allowFullScreen
            scrolling="no"
          />
        </div>
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
      </div>
    </div>
  )
}
