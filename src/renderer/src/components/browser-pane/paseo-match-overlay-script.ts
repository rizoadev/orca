/**
 * Guest-side script that renders the Paseo match-status pill. Kept in its own
 * module so the host-side pin/recover logic stays small; this file is one
 * responsibility: building that injected script string.
 *
 * The pill reads the workspace Paseo is currently showing and compares it to
 * Orca's active worktree: green ✓ when they match, red ✗ when they differ,
 * amber … while the workspace is still resolving. Paseo's current build
 * persists each workspace under a localStorage key of the form
 * `@paseo/provider-snapshot/v1:["<serverId>","<workspaceDirectory>"]`, so the
 * current path is resolved by scanning those keys first; the older
 * replica-cache shapes (IndexedDB `paseo-replica-cache` / localStorage
 * `@paseo:replica-cache`) stay as a fallback.
 */
import { PASEO_LAST_WORKSPACE_KEY, PASEO_REPLICA_CACHE_KEY } from './paseo-webview-style'

// Why: reload-only healing loops forever when the app reverts the pin; a
// mismatch escalates straight to host-side force-recover. Grace lets a fresh
// tab's queued pin settle; the throttle stops a reload storm.
const PASEO_MATCH_GRACE_MS = 3_000
const PASEO_MATCH_SIGNAL_THROTTLE_MS = 10_000

export function buildPaseoMatchOverlayScript(worktreePath: string): string {
  return `(() => {
    const target = ${JSON.stringify(worktreePath)}
    const guard = (window.__orcaPaseoOverlay ?? (window.__orcaPaseoOverlay = {}))
    if (guard.timer) clearInterval(guard.timer)
    const norm = (p) => (p || '').replace(/[\\\\/]+$/, '')
    const folderOf = (p) => p.split(/[\\\\/]+/).filter(Boolean).pop() || p
    const selectionKey = '${PASEO_LAST_WORKSPACE_KEY}'
    const cacheKey = '${PASEO_REPLICA_CACHE_KEY}'
    if (!guard.el) {
      guard.el = document.createElement('div')
      guard.el.setAttribute('data-orca-paseo-match', '')
      const s = guard.el.style
      // Why: rendered inside the workspace header (before the GitHub open
      // button) instead of floating over the viewport, so it reads as part of
      // the app chrome and never covers chat content.
      s.position = 'static'
      s.padding = '2px 8px'
      s.borderRadius = '999px'
      s.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
      s.background = 'rgba(15, 23, 42, 0.85)'
      s.color = '#e2e8f0'
      s.border = '1px solid rgba(148, 163, 184, 0.4)'
      s.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.35)'
      s.cursor = 'pointer'
      s.userSelect = 'none'
      s.whiteSpace = 'nowrap'
      s.display = 'flex'
      s.alignItems = 'center'
      s.gap = '6px'
      s.maxWidth = 'min(60vw, 420px)'
      s.overflow = 'hidden'
      s.textOverflow = 'ellipsis'
      const dot = document.createElement('span')
      dot.style.width = '8px'
      dot.style.height = '8px'
      dot.style.borderRadius = '50%'
      dot.style.flexShrink = '0'
      const label = document.createElement('span')
      label.style.overflow = 'hidden'
      label.style.textOverflow = 'ellipsis'
      guard.el.append(dot, label)
      guard.el.addEventListener('click', () => {
        // Why: click forces a full recover — re-attach the project (idempotent
        // open_project), re-pin the selection, and navigate to the workspace.
        console.log('[orca:paseo] force-recover')
      })
      document.body.appendChild(guard.el)
    }
    const [dot, label] = guard.el.children
    const signal = () => {
      if (sessionStorage.getItem('orcaPaseoForceSignaled')) return
      sessionStorage.setItem('orcaPaseoForceSignaled', '1')
      // Why: the host listens for this marker on console-message.
      console.log('[orca:paseo] force-recover')
    }
    const pinnedWorkspaceId = () => {
      try {
        const raw = localStorage.getItem(selectionKey)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed.workspaceId === 'string' ? parsed.workspaceId : null
      } catch (e) { return null }
    }
    const readReplicaCache = async () => {
      const parse = (raw) => {
        if (!raw) return null
        try {
          const cache = JSON.parse(raw)
          const hosts = Array.isArray(cache) ? cache : cache && Array.isArray(cache.hosts) ? cache.hosts : null
          return Array.isArray(hosts) ? hosts : null
        } catch (e) { return null }
      }
      // Why: localStorage is synchronous (the pin script reads/writes it there);
      // fall back to IndexedDB, whose open can be slow during early injection.
      try { const local = parse(localStorage.getItem(cacheKey)); if (local) return local } catch (e) { /* ignore */ }
      try {
        const raw = await new Promise((resolve) => {
          try {
            const open = indexedDB.open('paseo-replica-cache')
            open.onsuccess = () => {
              try {
                const tx = open.result.transaction('key-value', 'readonly').objectStore('key-value')
                const get = tx.get(cacheKey)
                get.onsuccess = () => resolve(get.result ?? null)
                get.onerror = () => resolve(null)
              } catch (e) { resolve(null) }
            }
            open.onerror = () => resolve(null)
          } catch (e) { resolve(null) }
        })
        return parse(raw)
      } catch (e) { return null }
    }
    const workspaceDirFor = async (workspaceId) => {
      if (!workspaceId) return null
      const hosts = await readReplicaCache()
      if (!hosts) return null
      for (const host of hosts) {
        for (const ws of (host.workspaces || [])) {
          if (ws.id === workspaceId && typeof ws.workspaceDirectory === 'string') return ws.workspaceDirectory
        }
      }
      return null
    }
    // Why: match the target path against the cache. Paseo's current build
    // persists each workspace under a localStorage KEY of the form
    // '@paseo/provider-snapshot/v1:["<serverId>","<path>"]' — the path is
    // embedded in the key itself. Scan those first (authoritative); the older
    // replica-cache shapes stay as a fallback.
    const dirForTarget = async () => {
      const folder = folderOf(target)
      const prefix = '@paseo/provider-snapshot/v1:'
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key || key.indexOf(prefix) !== 0) continue
          let dir = null
          try {
            const arr = JSON.parse(key.slice(prefix.length))
            if (Array.isArray(arr) && typeof arr[1] === 'string') dir = arr[1]
          } catch (e) { /* not a JSON key */ }
          if (dir && (dir === target || norm(dir) === norm(target) || folderOf(dir) === folder)) return dir
        }
      } catch (e) { /* ignore */ }
      const hosts = await readReplicaCache()
      if (!hosts) return null
      for (const host of hosts) {
        for (const agent of (host.agents || [])) {
          const cwd = agent && typeof agent.snapshot?.cwd === 'string' ? agent.snapshot.cwd : null
          if (cwd && (norm(cwd) === norm(target) || folderOf(cwd) === folder)) return cwd
        }
        for (const ws of (host.workspaces || [])) {
          const dir = typeof ws.workspaceDirectory === 'string' ? ws.workspaceDirectory : null
          if (dir && (norm(dir) === norm(target) || folderOf(dir) === folder)) return dir
        }
      }
      return null
    }
    const check = async () => {
      // Why: the app can replace body content without navigating; re-insert the
      // pill next to the workspace header's GitHub button (before it) whenever
      // the SPA re-renders the header. Falls back to the body if the anchor
      // isn't mounted yet.
      const anchor = document.querySelector('[aria-label="Open workspace in GitHub"]')
      if (anchor && anchor.parentElement) {
        if (guard.el.parentElement !== anchor.parentElement) {
          anchor.parentElement.insertBefore(guard.el, anchor)
        }
      } else if (!guard.el.isConnected) {
        document.body.appendChild(guard.el)
      }
      // Why: the URL route is what the app is actually displaying, so it wins
      // over the persisted selection - a stale pin must not keep the pill red
      // while the route already targets the right workspace.
      const routeMatch = location.pathname.match(/^\\/h\\/([^\\/]+)\\/workspace\\/([^\\/]+)/)
      const routeId = routeMatch ? decodeURIComponent(routeMatch[2]) : null
      const pinnedId = pinnedWorkspaceId()
      // Why: by-path match first (green even when route/persisted id shape
      // differs from the cache's ids), by-id as fallback.
      const current = (await dirForTarget()) ?? (await workspaceDirFor(routeId ?? pinnedId))
      const match = current !== null && norm(current) === norm(target)
      if (match) {
        dot.style.background = '#22c55e'
        label.textContent = '✓ ' + folderOf(target)
      } else if (current !== null) {
        dot.style.background = '#ef4444'
        label.textContent = '✗ ' + folderOf(current)
      } else {
        dot.style.background = '#f59e0b'
        label.textContent = '… ' + folderOf(target)
      }
      guard.el.title = 'target: ' + target + '\\ncurrent: ' + (current ?? '(unset)') + '\\nclick: re-attach workspace'
      if (match) {
        sessionStorage.removeItem('orcaPaseoForceSignaled')
        guard.lastForcedAt = null
        return
      }
      // Why: a fresh tab is expected to mismatch briefly while its queued
      // pin+reload settles; force only once that grace has elapsed.
      if (!guard.bootedAt) guard.bootedAt = Date.now()
      if (Date.now() - guard.bootedAt < ${PASEO_MATCH_GRACE_MS}) return
      if (guard.lastForcedAt && Date.now() - guard.lastForcedAt < ${PASEO_MATCH_SIGNAL_THROTTLE_MS}) {
        return
      }
      guard.lastForcedAt = Date.now()
      signal()
    }
    check()
    guard.timer = setInterval(check, 1500)
  })()`
}
