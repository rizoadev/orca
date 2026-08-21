/**
 * Match-dir checker + auto-heal for the embedded Paseo web app. Injects a
 * bottom-right overlay pill that shows whether the workspace the app is
 * pinned to matches Orca's active worktree; a persistent mismatch (or a click
 * on the pill) signals the host to force-recover: restart a dead daemon,
 * re-attach the project (idempotent open_project), re-pin the selection, and
 * navigate to the workspace route. Mirrors the OpenChamber overlay contract.
 */
import { useAppStore } from '@/store'
import {
  isPaseoWebviewUrl,
  PASEO_LAST_WORKSPACE_KEY,
  PASEO_REPLICA_CACHE_KEY
} from './paseo-webview-style'

// Why: reload-only healing loops forever when the app reverts the pin, so a
// mismatch escalates straight to host-side force-recover (re-attach + re-pin
// + navigate). Grace lets a fresh tab's queued pin settle; the throttle stops
// a reload storm from signaling the host every tick.
const PASEO_MATCH_GRACE_MS = 3_000
const PASEO_MATCH_SIGNAL_THROTTLE_MS = 10_000
// Why: 30s cooldown mirrors OpenChamber — long enough to avoid a recover
// loop, short enough that the pill stays responsive after a slow restart.
const PASEO_FORCE_COOLDOWN_MS = 30_000
// Why: a transient attach miss (daemon still starting, response lost) must
// not strand the webview on the daemon's /open-project home; retry against
// the Orca active worktree cwd until a workspace exists.
const PASEO_ATTACH_RETRY_DELAY_MS = 1_000
const PASEO_ATTACH_RETRY_MAX_MS = 10_000
// Why: the SPA's host registry pins the daemon serverId; when the daemon home
// is wiped the id changes and the stale registry rejects the connection. Orca
// tracks the last-known id and clears the webview partition once on change so
// the app re-bootstraps from the daemon-injected connection hint.
const PASEO_KNOWN_SERVER_ID_KEY = 'orca:paseo-server-id'

/**
 * Clear the paseo webview partition when the daemon's serverId changed since
 * the last attach. Returns true when storage was cleared (webview should load
 * fresh); records the current id for the next attach either way.
 */
export async function reconcilePaseoServerId(serverId: string | null): Promise<boolean> {
  if (!serverId) {
    return false
  }
  const known = localStorage.getItem(PASEO_KNOWN_SERVER_ID_KEY)
  if (known && known !== serverId) {
    await window.api.paseo.clearWebviewStorage().catch(() => undefined)
    localStorage.setItem(PASEO_KNOWN_SERVER_ID_KEY, serverId)
    return true
  }
  localStorage.setItem(PASEO_KNOWN_SERVER_ID_KEY, serverId)
  return false
}

/**
 * Attach the Orca active worktree cwd to Paseo, retrying until the daemon
 * returns a workspace (or the deadline passes). Returns null-ish on a
 * persistent failure so callers can fall back to the daemon root URL.
 */
export async function retryPaseoAttach(
  cwd: string,
  isCancelled: () => boolean
): Promise<{ workspaceId: string | null; serverId: string | null }> {
  const deadline = Date.now() + PASEO_ATTACH_RETRY_MAX_MS
  for (;;) {
    if (isCancelled()) {
      return { workspaceId: null, serverId: null }
    }
    const attach = await window.api.paseo.attachProject(cwd).catch(() => null)
    if (attach?.workspaceId && attach.serverId) {
      return { workspaceId: attach.workspaceId, serverId: attach.serverId }
    }
    if (Date.now() >= deadline) {
      return { workspaceId: null, serverId: null }
    }
    await new Promise((resolve) => setTimeout(resolve, PASEO_ATTACH_RETRY_DELAY_MS))
  }
}

/**
 * Build the guest-side match-status overlay script. Renders a bottom-right
 * pill showing whether the workspace the Paseo app is pinned to (persisted
 * selection + URL route, resolved through its replica cache) matches Orca's
 * active worktree path — green ✓ when it matches, red ✗ with the mismatching
 * folder when it does not, amber … while the workspace is still resolving.
 * Clicking the pill signals the host to force-recover (re-attach + re-pin +
 * navigate). On a persistent mismatch after the boot grace, the pill signals
 * automatically. Guarded on `window` so re-injections replace — not stack —
 * the interval and element.
 */
function buildPaseoMatchOverlayScript(worktreePath: string): string {
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
      s.position = 'fixed'
      s.right = '12px'
      s.top = '12px'
      s.zIndex = '2147483647'
      s.padding = '4px 10px'
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
      // Why: the host listens for this marker on the webview's
      // console-message and escalates to re-attach + re-pin + navigate.
      console.log('[orca:paseo] force-recover')
    }
    const pinnedWorkspaceId = () => {
      try {
        const raw = localStorage.getItem(selectionKey)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed.workspaceId === 'string' ? parsed.workspaceId : null
      } catch (e) { /* ignore malformed */ }
      return null
    }
    const workspaceDirFor = async (workspaceId) => {
      if (!workspaceId) return null
      try {
        // Why: the SPA keeps its replica cache in IndexedDB, not localStorage -
        // a localStorage read here would stay unresolved and never turn green.
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
        if (!raw) return null
        const cache = JSON.parse(raw)
        const hosts = Array.isArray(cache) ? cache : cache && Array.isArray(cache.hosts) ? cache.hosts : null
        if (!hosts) return null
        for (const host of hosts) {
          for (const ws of (host.workspaces || [])) {
            if (ws.id === workspaceId && typeof ws.workspaceDirectory === 'string') {
              return ws.workspaceDirectory
            }
          }
        }
      } catch (e) { /* ignore malformed cache */ }
      return null
    }
    const check = async () => {
      // Why: the app can replace body content without navigating; re-append the
      // pill so the status overlay is self-healing between full reloads.
      if (!guard.el.isConnected) document.body.appendChild(guard.el)
      // Why: the URL route is what the app is actually displaying, so it wins
      // over the persisted selection - a stale pin must not keep the pill red
      // while the route already targets the right workspace.
      const routeMatch = location.pathname.match(/^\\/h\\/([^\\/]+)\\/workspace\\/([^\\/]+)/)
      const routeId = routeMatch ? decodeURIComponent(routeMatch[2]) : null
      const pinnedId = pinnedWorkspaceId()
      const current = await workspaceDirFor(routeId ?? pinnedId)
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

/**
 * Inject the bottom-right match-status pill into the Paseo web UI. Shows
 * whether the app is pinned to the Orca worktree; clicking (or a persistent
 * mismatch after the boot grace) force-recovers: the host re-attaches the
 * project (idempotent), re-pins the selection, and navigates to the
 * workspace route. Best-effort.
 */
export function injectPaseoMatchOverlay(
  webview: Electron.WebviewTag,
  url: string,
  worktreePath: string
): void {
  if (!isPaseoWebviewUrl(url)) {
    return
  }
  void webview.executeJavaScript(buildPaseoMatchOverlayScript(worktreePath)).catch(() => undefined)
}

/**
 * Force-recover a Paseo tab whose app will not converge on the worktree
 * workspace (stale selection, workspace missing after a daemon restart, or a
 * dead daemon). Restarts the daemon when it is down, re-attaches the project
 * (open_project dedupes by cwd), re-pins the persisted selection BEFORE the
 * fresh page boots, and navigates to the workspace route.
 */
export async function forceRecoverPaseo(
  webview: Electron.WebviewTag,
  worktreePath: string
): Promise<void> {
  try {
    const status = await window.api.paseo.start()
    const attach = await window.api.paseo.attachProject(worktreePath)
    if (!attach?.workspaceId || !attach.serverId) {
      return
    }
    // Why: a daemon identity change (wiped home) leaves the SPA's host
    // registry stale; clear the partition so the fresh page re-bootstraps.
    await reconcilePaseoServerId(attach.serverId)
    const base = status.url ?? `http://127.0.0.1:${status.port}`
    const url = `http://127.0.0.1:${new URL(base).port}/h/${encodeURIComponent(attach.serverId)}/workspace/${encodeURIComponent(attach.workspaceId)}`
    // Why: re-pin BEFORE the SPA boots so the fresh page hydrates onto the
    // worktree workspace instead of a stale last-loaded one (which would leave
    // the pill red and trigger another force-recover).
    const selection = JSON.stringify({ serverId: attach.serverId, workspaceId: attach.workspaceId })
    try {
      await webview.executeJavaScript(
        `localStorage.setItem('${PASEO_LAST_WORKSPACE_KEY}', ${JSON.stringify(selection)})`
      )
    } catch {
      // Best-effort — poll/inject re-pins on the next pass.
    }
    try {
      await webview.loadURL(url)
    } catch {
      webview.reload()
    }
  } catch {
    // Best-effort — the next poll/injection pass retries.
  }
}

/**
 * Listen for the guest's `[orca:paseo] force-recover` console marker and
 * escalate to the host-side recover. Cooldown prevents the app from
 * re-triggering recovery in a tight loop.
 */
export function listenForPaseoForceRecover(
  webview: Electron.WebviewTag,
  worktreePath: string
): void {
  const cooldownKey = `orcaPaseoForceCooldown:${worktreePath}`
  // Why: stale cooldowns must not silence recovery forever — only an unexpired
  // timestamp blocks; anything else is cleared so the pill stays responsive.
  const expiredCooldown = (): boolean => {
    const stamp = Number(sessionStorage.getItem(cooldownKey) || 0)
    if (stamp && Date.now() >= stamp) {
      sessionStorage.removeItem(cooldownKey)
    }
    return stamp !== 0 && Date.now() < stamp
  }
  if (expiredCooldown()) {
    return
  }
  const onConsoleMessage = (event: Electron.ConsoleMessageEvent): void => {
    if (
      typeof event.message !== 'string' ||
      !event.message.includes('[orca:paseo] force-recover')
    ) {
      return
    }
    if (expiredCooldown()) {
      return
    }
    sessionStorage.setItem(cooldownKey, String(Date.now() + PASEO_FORCE_COOLDOWN_MS))
    void forceRecoverPaseo(webview, worktreePath)
  }
  webview.addEventListener('console-message', onConsoleMessage as EventListener)
}

/**
 * Poll a Paseo view until its daemon is up and the workspace for the worktree
 * path is attached. Re-injects the match overlay (a pin+reload can tear down
 * the page mid injection), restarts a dead daemon, and re-attaches the
 * project — the pill's auto-heal then converges the SPA onto the workspace
 * route. Best-effort: transient failures (page loading / host starting) just
 * retry on the next pass.
 */
export async function pollPaseoDirectorySync(
  webview: Electron.WebviewTag | null | undefined,
  worktreeId: string,
  expectedCwd: string
): Promise<void> {
  if (!webview) {
    return
  }
  const path = useAppStore.getState().getKnownWorktreeById(worktreeId)?.path ?? expectedCwd
  try {
    injectPaseoMatchOverlay(webview, webview.getURL(), path)
    const status = await window.api.paseo.getStatus()
    if (status.state !== 'running') {
      // Why: auto-heal a dead/errored daemon so the tab converges without a
      // manual retry, mirroring OpenChamber's crash restart.
      await window.api.paseo.start().catch(() => undefined)
    }
    // Why: idempotent — open_project reuses the active workspace for the path.
    await window.api.paseo.attachProject(path).catch(() => undefined)
  } catch {
    // Why: transient (page loading / host starting) — the pill retries.
  }
}
