/**
 * Slim HTTP helpers for talking to an OpenChamber web server child — kept out
 * of the manager so its file stays under the line budget.
 */
import type {
  OpenChamberSessionSummary,
  OpenChamberWebState,
  OpenChamberWebStatus
} from '../../shared/openchamber-web-types'

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

/**
 * Directories from `directories` with a busy (non-idle) LLM turn on any of
 * `serverUrls`. The upstream /api/session/status endpoint is directory-scoped
 * and omits idle sessions, so an empty object means idle.
 */
export async function fetchBusyDirectories(url: string, directories: string[]): Promise<string[]> {
  const busy = await Promise.all(
    directories.map(async (directory) => {
      try {
        const query = new URLSearchParams({ directory })
        const res = await fetch(`${url}/api/session/status?${query}`, {
          signal: AbortSignal.timeout(4_000)
        })
        if (!res.ok) {
          return null
        }
        const body = (await res.json()) as unknown
        return body && typeof body === 'object' && Object.keys(body).length > 0 ? directory : null
      } catch {
        return null
      }
    })
  )
  return busy.filter((d): d is string => d !== null)
}

/**
 * Ask every running server and union the busy directories — sessions can live
 * on a non-active instance (each server keeps its own history).
 */
export async function fetchBusyDirectoriesAcrossServers(
  serverUrls: string[],
  directories: string[]
): Promise<string[]> {
  if (directories.length === 0 || serverUrls.length === 0) {
    return []
  }
  const busy = await Promise.all(serverUrls.map((url) => fetchBusyDirectories(url, directories)))
  return [...new Set(busy.flat())]
}

/** Slim projection of an instance for IPC consumers; null → stopped status. */
export function projectWebStatus(
  instance: {
    state: OpenChamberWebState
    port: number
    child: { pid?: number } | null
    opencodeBinary: string | null
    cwd: string | null
    error: string | null
  } | null,
  url: string | null,
  fallbackPort: number
): OpenChamberWebStatus {
  if (!instance) {
    return {
      state: 'stopped',
      port: fallbackPort,
      url: null,
      pid: null,
      opencodeBinary: null,
      cwd: null,
      error: null
    }
  }
  return {
    state: instance.state,
    port: instance.port,
    url: instance.state === 'running' ? url : null,
    pid: instance.child?.pid ?? null,
    opencodeBinary: instance.opencodeBinary,
    cwd: instance.cwd,
    error: instance.error
  }
}
