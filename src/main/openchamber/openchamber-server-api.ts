/**
 * Slim HTTP helpers for talking to an OpenChamber web server child — kept out
 * of the manager so its file stays under the line budget.
 */
import type { OpenChamberSessionSummary } from '../../shared/openchamber-web-types'

async function fetchSessionPayload(url: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${url}/api/session`, {
      signal: AbortSignal.timeout(5_000)
    })
    if (!res.ok) {
      return null
    }
    const body = (await res.json()) as unknown[] | { data?: unknown[] }
    return Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : null
  } catch {
    return null
  }
}

/** All sessions on a server (slim projection for the in-app list). */
export async function fetchSessionSummaries(
  url: string,
  fallbackCwd: string
): Promise<OpenChamberSessionSummary[]> {
  const items = await fetchSessionPayload(url)
  if (!items) {
    return []
  }
  return items.map((item) => {
    const session = (item ?? {}) as {
      id?: unknown
      directory?: unknown
      time?: { updated?: unknown; created?: unknown }
      title?: unknown
    }
    return {
      sessionId: typeof session.id === 'string' ? session.id : '',
      directory: typeof session.directory === 'string' ? session.directory : fallbackCwd,
      title: typeof session.title === 'string' ? session.title : null,
      updatedAt:
        ((typeof session.time?.updated === 'number' ? session.time.updated : 0) ||
          (typeof session.time?.created === 'number' ? session.time.created : 0)) ??
        0
    }
  })
}

/** Number of sessions on a server (for the overview table row). */
export async function fetchSessionCount(url: string): Promise<number> {
  const items = await fetchSessionPayload(url)
  return items?.length ?? 0
}
