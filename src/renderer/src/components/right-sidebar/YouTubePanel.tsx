import React, { useCallback, useState } from 'react'
import { AlertCircle, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type SearchItem = {
  videoId: string
  title: string
  uploader: string
  durationSeconds: number
  thumbnail: string
  uploadedDate: string
  views: number
}

type ApiResult<T> = { ok: true } & T | { ok: false; error: string }

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) {
    return ''
  }
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatViews(views: number): string {
  if (views >= 1_000_000_000) {
    return `${(views / 1_000_000_000).toFixed(1)}B views`
  }
  if (views >= 1_000_000) {
    return `${(views / 1_000_000).toFixed(1)}M views`
  }
  if (views >= 1_000) {
    return `${(views / 1_000).toFixed(1)}K views`
  }
  return `${views} views`
}

export function YouTubePanel(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SearchItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null)
  const [playingTitle, setPlayingTitle] = useState('')
  const [playingUploader, setPlayingUploader] = useState('')

  const runSearch = useCallback(async (raw: string): Promise<void> => {
    const trimmed = raw.trim()
    if (!trimmed) {
      return
    }
    setSearching(true)
    setSearchError(null)
    setItems([])
    try {
      const result = (await window.api?.youtube?.search({ query: trimmed })) as
        | ApiResult<{ items: SearchItem[] }>
        | undefined
      if (!result) {
        setSearchError('YouTube panel requires the Orca desktop app.')
      } else if (result.ok) {
        setItems(result.items)
        if (result.items.length === 0) {
          setSearchError('No results.')
        }
      } else {
        setSearchError(result.error)
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }, [])

  const playVideo = useCallback((item: SearchItem): void => {
    setPlayingVideoId(item.videoId)
    setPlayingTitle(item.title)
    setPlayingUploader(item.uploader)
  }, [])

  const onSubmitSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      void runSearch(query)
    },
    [query, runSearch]
  )

  const closePlayer = useCallback((): void => {
    setPlayingVideoId(null)
    setPlayingTitle('')
    setPlayingUploader('')
  }, [])

  // Why: rel=0 + modestbranding minimizes YouTube's end-of-video related-video
  // overlay (which can surface ads); the official embed has no pre-roll for most
  // videos. This is the most reliable ad-light approach — no third-party proxy.
  const embedSrc = playingVideoId
    ? `https://www.youtube.com/embed/${playingVideoId}?rel=0&modestbranding=1`
    : null

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Search bar */}
      <div className="shrink-0 border-b border-sidebar-border px-2 py-2">
        <form onSubmit={onSubmitSearch} className="relative flex items-center">
          <Search size={13} className="pointer-events-none absolute left-2 text-muted-foreground/70" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={translate(
              'auto.components.right.sidebar.YouTubePanel.searchPlaceholder',
              'Search YouTube'
            )}
            className="h-7 rounded-md pl-7 pr-7 text-xs"
            spellCheck={false}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 text-muted-foreground/60 hover:text-foreground"
              aria-label="Clear"
            >
              <X size={13} />
            </button>
          ) : null}
        </form>
      </div>

      {/* Player — official YouTube iframe embed */}
      {playingVideoId ? (
        <div className="shrink-0 border-b border-sidebar-border bg-black">
          <div style={{ left: 0, width: '100%', height: 0, position: 'relative', paddingBottom: '56.25%' }}>
            {embedSrc ? (
              <iframe
                src={embedSrc}
                title={playingTitle}
                style={{ top: 0, left: 0, width: '100%', height: '100%', position: 'absolute', border: 0 }}
                allow="accelerometer *; clipboard-write *; encrypted-media *; gyroscope *; picture-in-picture *; web-share *;"
                referrerPolicy="strict-origin"
                allowFullScreen
                scrolling="no"
              />
            ) : null}
          </div>
          <div className="flex items-start gap-2 px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{playingTitle}</p>
              <p className="truncate text-[11px] text-muted-foreground">{playingUploader}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={closePlayer}
                  aria-label="Close player"
                >
                  <X size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close</TooltipContent>
            </Tooltip>
          </div>
        </div>
      ) : null}

      {/* Results list */}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        {searching ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            <span>Searching…</span>
          </div>
        ) : searchError && items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center text-xs text-muted-foreground">
            <AlertCircle size={18} className="text-rose-500" />
            <span>{searchError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-[11px]"
              onClick={() => runSearch(query)}
            >
              {translate('auto.components.right.sidebar.YouTubePanel.retry', 'Retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center px-4 py-10 text-center text-xs text-muted-foreground">
            {translate(
              'auto.components.right.sidebar.YouTubePanel.emptyHint',
              'Search for videos above.'
            )}
          </div>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.videoId}>
                <button
                  type="button"
                  onClick={() => playVideo(item)}
                  className={cn(
                    'flex w-full gap-2 border-b border-sidebar-border/60 px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/50',
                    playingVideoId === item.videoId && 'bg-sidebar-accent/70'
                  )}
                >
                  <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded bg-muted">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                    {item.durationSeconds > 0 ? (
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[10px] font-medium text-white">
                        {formatDuration(item.durationSeconds)}
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
                      {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {item.uploader}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground/70">
                      {item.uploadedDate}
                      {item.views > 0 ? ` · ${formatViews(item.views)}` : ''}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default YouTubePanel
