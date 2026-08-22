/**
 * Slim HTTP helpers for talking to a Reasonix `serve` child — kept out of the
 * manager so its file stays under the line budget. Reasonix serves a typed web
 * UI: GET /sessions (array of {name,path,title,turns,current}) and GET /status
 * ({ running: bool, cwd: string, … }).
 */
import type {
  ReasonixSessionSummary,
  ReasonixWebState,
  ReasonixWebStatus
} from '../../shared/reasonix-web-types'

/** Number of sessions on a server (for the overview table row). */
export async function fetchSessionCount(url: string): Promise<number> {
  const items = await fetchSessionPayload(url)
  return items?.length ?? 0
}

/** All sessions on a server (slim projection for the in-app list). */
export async function fetchSessionSummaries(url: string): Promise<ReasonixSessionSummary[]> {
  const items = await fetchSessionPayload(url)
  if (!items) {
    return []
  }
  return items.map((item) => {
    const session = (item ?? {}) as {
      name?: unknown
      path?: unknown
      title?: unknown
      turns?: unknown
      current?: unknown
    }
    return {
      sessionId: typeof session.name === 'string' ? session.name : '',
      path: typeof session.path === 'string' ? session.path : '',
      title: typeof session.title === 'string' ? session.title : null,
      turns: typeof session.turns === 'number' ? session.turns : 0,
      current: session.current === true
    }
  })
}

async function fetchSessionPayload(url: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${url}/sessions`, { signal: AbortSignal.timeout(5_000) })
    if (!res.ok) {
      return null
    }
    const body = (await res.json()) as unknown
    return Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

/**
 * Directories with a busy (actively running) LLM turn on any of `ports`.
 * Reasonix /status reports `running: bool`; an idle server reports false, so
 * only directories whose server is mid-turn count as busy.
 */
export async function fetchBusyDirectoriesOnPorts(
  ports: number[],
  directories: string[]
): Promise<string[]> {
  if (directories.length === 0 || ports.length === 0) {
    return []
  }
  const busy = await Promise.all(
    ports.map((port) => fetchBusyDirectories(`http://127.0.0.1:${port}`, directories))
  )
  return [...new Set(busy.flat())]
}

/** Directories (of `directories`) with a running turn on the server at `url`. */
export async function fetchBusyDirectories(url: string, directories: string[]): Promise<string[]> {
  const matched: string[] = []
  await Promise.all(
    directories.map(async (directory) => {
      try {
        const res = await fetch(`${url}/status`, { signal: AbortSignal.timeout(4_000) })
        if (!res.ok) {
          return
        }
        const body = (await res.json()) as { running?: unknown; cwd?: unknown }
        // Why: only trust a status-shaped object; foreign JSON on a shared
        // loopback port must never read as busy.
        if (body.running === true && typeof body.cwd === 'string' && body.cwd === directory) {
          matched.push(directory)
        }
      } catch {
        // Server not up / not ours — not busy.
      }
    })
  )
  return matched
}

/** Slim projection of an instance for IPC consumers; null → stopped status. */
export function projectWebStatus(
  instance: {
    state: ReasonixWebState
    port: number
    child: { pid?: number } | null
    binary: string | null
    cwd: string | null
    error: string | null
  } | null,
  url: string | null,
  fallbackPort: number
): ReasonixWebStatus {
  if (!instance) {
    return {
      state: 'stopped',
      port: fallbackPort,
      url: null,
      pid: null,
      binary: null,
      cwd: null,
      error: null
    }
  }
  return {
    state: instance.state,
    port: instance.port,
    url: instance.state === 'running' ? url : null,
    pid: instance.child?.pid ?? null,
    binary: instance.binary,
    cwd: instance.cwd,
    error: instance.error
  }
}
