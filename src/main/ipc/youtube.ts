/**
 * YouTube proxy via Piped instances — search + stream resolution proxied
 * through the main process (Electron net.fetch) so the packaged file://
 * renderer avoids CORS. Piped strips YouTube ads by re-hosting streams.
 */
import { ipcMain, net } from 'electron'
import { ensureYouTubeEmbedServer } from './youtube-embed-server'

// Why: Piped instances go down often; try each in order until one answers.
// Keep the most reliable first; public instances fluctuate hourly.
const PIPED_API_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.syncpundit.io'
]

const REQUEST_TIMEOUT_MS = 12_000
// Why: transient 502/503 from Piped instances often clear on a quick retry;
// retry the same instance once before falling through to the next.
const RETRY_DELAY_MS = 800

export type YouTubeSearchItem = {
  videoId: string
  title: string
  uploader: string
  durationSeconds: number
  thumbnail: string
  uploadedDate: string
  views: number
}

export type YouTubeSearchResult =
  | { ok: true; items: YouTubeSearchItem[] }
  | { ok: false; error: string }

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await net.fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Orca/1.0' }
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

/** Try each Piped instance until one returns a usable response. */
async function fetchFromInstances(path: string): Promise<unknown> {
  let lastError = 'All Piped instances failed'
  for (let i = 0; i < PIPED_API_INSTANCES.length; i++) {
    const base = PIPED_API_INSTANCES[i]
    // Why: public Piped instances rate-limit rapid successive calls; a short
    // stagger before retries (not the first attempt) avoids tripping 429/502.
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    // Why: transient 502/503 often clears on a quick same-instance retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fetchJsonWithTimeout(`${base}${path}`)
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        }
      }
    }
  }
  throw new Error(lastError)
}

type PipedSearchItem = {
  url?: string
  title?: string
  uploaderName?: string
  duration?: number
  thumbnail?: string
  uploadedDate?: string
  views?: number
}

function extractVideoIdFromUrl(url: string): string | null {
  const match = url.match(/v=([A-Za-z0-9_-]{11})/)
  return match ? (match[1] ?? null) : null
}

export function registerYouTubeHandlers(): void {
  ipcMain.handle('youtube:search', async (_event, args: { query: string }): Promise<YouTubeSearchResult> => {
    const query = typeof args?.query === 'string' ? args.query.trim() : ''
    if (!query) {
      return { ok: true, items: [] }
    }
    try {
      const data = (await fetchFromInstances(
        `/search?q=${encodeURIComponent(query)}&filter=videos`
      )) as { items?: PipedSearchItem[] }
      const items: YouTubeSearchItem[] = (data.items ?? [])
        .filter((item) => item.url && extractVideoIdFromUrl(item.url ?? ''))
        .map((item) => ({
          videoId: extractVideoIdFromUrl(item.url ?? '') ?? '',
          title: item.title ?? '(no title)',
          uploader: item.uploaderName ?? '',
          durationSeconds: item.duration ?? 0,
          thumbnail: item.thumbnail ?? '',
          uploadedDate: item.uploadedDate ?? '',
          views: item.views ?? 0
        }))
      return { ok: true, items }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Why: return the local embed server port so the renderer can load
  // http://127.0.0.1:PORT/embed/VIDEO_ID in the webview — a real HTTP origin
  // avoids YouTube's Error 153 (null/data: origin rejection).
  ipcMain.handle('youtube:embedPort', async (): Promise<number> => {
    try {
      return await ensureYouTubeEmbedServer()
    } catch {
      return 0
    }
  })
}
