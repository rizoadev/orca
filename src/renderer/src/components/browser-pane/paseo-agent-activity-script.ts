/**
 * Per-worktree LLM activity for the embedded Paseo web app. Paseo's daemon
 * exposes no HTTP session API, but the SPA persists an agent replica cache
 * (same IndexedDB document the workspace filter reads) where every agent
 * carries its cwd and lifecycle status. A guest-side poller scans it and
 * reports per-directory activity to Orca through a console-message marker —
 * the same channel the match-pill force-recover uses.
 */

// Why: 'initializing' counts as working so a just-submitted prompt flips the
// dot immediately instead of waiting for the first stream chunk.
const WORKING_STATUSES = new Set(['running', 'initializing'])

type ActivityByPath = Record<string, boolean>

const POLL_INTERVAL_MS = 4_000

/** Marker prefix the host listens for on the webview's console-message. */
const ACTIVITY_MARKER = '[orca:paseo] activity '

export function buildPaseoAgentActivityScript(): string {
  return `(() => {
  if (window.__orcaPaseoActivity) return
  window.__orcaPaseoActivity = { last: '' }
  const norm = (p) => typeof p === 'string' ? p.replace(/\\\\+/g, '/').replace(/\\/+$/, '') : ''
  const readCache = () => new Promise((resolve) => {
    try {
      const open = indexedDB.open('paseo-replica-cache')
      open.onsuccess = () => {
        try {
          const tx = open.result.transaction('key-value', 'readonly').objectStore('key-value')
          const get = tx.get('@paseo:replica-cache')
          get.onsuccess = () => {
            try { resolve(JSON.parse(get.result || 'null')) } catch (e) { resolve(null) }
          }
          get.onerror = () => resolve(null)
        } catch (e) { resolve(null) }
      }
      open.onerror = () => resolve(null)
    } catch (e) { resolve(null) }
  })
  const poll = async () => {
    const cache = await readCache()
    const byPath = {}
    const hosts = Array.isArray(cache?.hosts) ? cache.hosts : []
    for (const host of hosts) {
      for (const agent of Array.isArray(host.agents) ? host.agents : []) {
        const snap = agent && typeof agent.snapshot === 'object' ? agent.snapshot : null
        const cwd = norm(snap?.cwd)
        if (!cwd) continue
        const turnActive = snap.activeTurn != null
        byPath[cwd] = byPath[cwd] || turnActive ||
          (typeof snap.status === 'string' && ${JSON.stringify([...WORKING_STATUSES])}.includes(snap.status))
      }
    }
    // Why: only emit on change — console lines are the transport, so an
    // unchanged state must stay silent or the host would churn every poll.
    const flat = JSON.stringify(byPath)
    if (flat !== window.__orcaPaseoActivity.last) {
      window.__orcaPaseoActivity.last = flat
      console.log('${ACTIVITY_MARKER}' + flat)
    }
  }
  poll()
  setInterval(poll, ${POLL_INTERVAL_MS})
})()`
}

/**
 * Host-side listener: parses `[orca:paseo] activity {json}` console markers
 * from the guest and reports them to the shared activity store. Paths are
 * global keys, so any live Paseo webview keeps the whole map fresh.
 */
export function listenForPaseoAgentActivity(
  webview: Electron.WebviewTag,
  onActivity: (byPath: Record<string, boolean>) => void
): void {
  const onConsoleMessage = (event: { message: string }): void => {
    if (!event.message.startsWith(ACTIVITY_MARKER)) {
      return
    }
    try {
      const parsed = JSON.parse(event.message.slice(ACTIVITY_MARKER.length)) as ActivityByPath
      if (parsed && typeof parsed === 'object') {
        onActivity(parsed)
      }
    } catch {
      // Malformed marker — ignore; the next poll re-emits.
    }
  }
  webview.addEventListener('console-message', onConsoleMessage as unknown as EventListener)
}

/** Inject the poller into a Paseo webview (call on every dom-ready). */
export function injectPaseoAgentActivity(webview: Electron.WebviewTag): void {
  void webview.executeJavaScript(buildPaseoAgentActivityScript()).catch(() => undefined)
}
