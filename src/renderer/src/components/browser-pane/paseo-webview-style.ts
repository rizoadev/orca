/**
 * Injected styling/behavior for the embedded Paseo web app (browser tab).
 * Pins the app's persisted last-workspace selection to the workspace that
 * matches Orca's active worktree, so the chat always runs in the folder the
 * user is looking at. The sidebar keeps the current workspace and its session
 * list visible; everything else is filtered out.
 */

// Why: the Paseo web app always lives under its /h/ host route (workspace or
// sessions); DeepSeek Harness serves its SPA from the loopback root, so this
// narrower pattern keeps browser-pane injections from touching DeepSeek.
const PASEO_WEBVIEW_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/h\//

// Why: AsyncStorage (web) stores this key verbatim in localStorage; setting it
// pins the app to a specific workspace, clearing it lets the URL route win.
export const PASEO_LAST_WORKSPACE_KEY = 'paseo:last-workspace-route-selection'
const PASEO_RESET_MARKER_KEY = 'paseo:selection-reset'
// Why: the web app's own replica cache resolves a pinned workspace id back to
// its directory; the match overlay checks this to decide whether the SPA
// matches Orca's active worktree.
export const PASEO_REPLICA_CACHE_KEY = '@paseo:replica-cache'

// Why: renderer flows (open tab, worktree-follow, sidebar page) resolve the
// workspace for Orca's active worktree asynchronously; queue it here keyed by
// the webview page id so the dom-ready handler can write it to localStorage.
const pendingSelections = new Map<string, { serverId: string; workspaceId: string }>()
// Why: a lighter queue for the active worktree path; the dom-ready script
// resolves the matching workspace from the web app's own replica cache.
const pendingCwds = new Map<string, string>()

export function queuePaseoWorkspaceSelection(
  pageId: string,
  serverId: string,
  workspaceId: string
): void {
  pendingSelections.set(pageId, { serverId, workspaceId })
}

export function queuePaseoCwd(pageId: string, cwd: string): void {
  pendingCwds.set(pageId, cwd)
}

export function isPaseoWebviewUrl(url: string): boolean {
  return PASEO_WEBVIEW_URL_PATTERN.test(url)
}

// Why: the SPA keeps its replica cache in IndexedDB (key-value store); both
// the match overlay and the sidebar filter resolve workspace ids through it.
const PASEO_REPLICA_CACHE_DB = 'paseo-replica-cache'
const PASEO_REPLICA_CACHE_STORE = 'key-value'

// Why: the SPA home (no workspace selection yet) lives at the daemon root and
// redirects to /open-project; recovery injection must also run there, or a
// failed attach strands the webview without a pill or force-recover.
const PASEO_WEBVIEW_ROOT_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/(open-project)?(\?.*)?$/

export function isPaseoWebviewRootUrl(url: string): boolean {
  return PASEO_WEBVIEW_ROOT_URL_PATTERN.test(url)
}

/**
 * Build the guest-side sidebar filter script. Keeps ONLY the current workspace
 * (the one whose directory matches the Orca worktree path) and its session
 * list; every other project/workspace row, the global "New workspace" entry
 * and Schedules are hidden. Navigation chrome (History, command center,
 * display preferences) stays visible. Resolves the current workspace through
 * the app's IndexedDB replica cache; while the cache is unresolved nothing is
 * hidden (a transient state must not collapse the whole sidebar). A
 * MutationObserver re-applies because the SPA re-renders the sidebar without
 * navigating; guarded on `window` so repeated injections replace — not stack —
 * observers.
 */
function buildPaseoWorkspaceFilterScript(worktreePath: string): string {
  return `(() => {
    const target = ${JSON.stringify(worktreePath)}
    const guard = (window.__orcaPaseoFilter ?? (window.__orcaPaseoFilter = { observer: null }))
    if (guard.observer) guard.observer.disconnect()
    const norm = (p) => (p || '').replace(/[\\\\/]+$/, '')
    const cacheKey = '${PASEO_REPLICA_CACHE_KEY}'
    let timer = 0
    // Why: resolve the workspace whose directory matches the Orca worktree
    // path through the SPA's IndexedDB replica cache; the sidebar keeps only
    // that workspace row and its session list.
    const resolveTargetId = () => new Promise((resolve) => {
      try {
        const open = indexedDB.open('${PASEO_REPLICA_CACHE_DB}')
        open.onsuccess = () => {
          try {
            const tx = open.result.transaction('${PASEO_REPLICA_CACHE_STORE}', 'readonly').objectStore('${PASEO_REPLICA_CACHE_STORE}')
            const get = tx.get(cacheKey)
            get.onsuccess = () => {
              try {
                const cache = JSON.parse(get.result || 'null')
                const hosts = Array.isArray(cache) ? cache : cache && Array.isArray(cache.hosts) ? cache.hosts : null
                if (hosts) {
                  outer: for (const host of hosts) {
                    for (const ws of (host.workspaces || [])) {
                      if (typeof ws.workspaceDirectory === 'string' && norm(ws.workspaceDirectory) === norm(target)) {
                        resolve(ws.id)
                        break outer
                      }
                    }
                  }
                }
                resolve(null)
              } catch (e) { resolve(null) }
            }
            get.onerror = () => resolve(null)
          } catch (e) { resolve(null) }
        }
        open.onerror = () => resolve(null)
      } catch (e) { resolve(null) }
    })
    const apply = async () => {
      const scroller = document.querySelector('[data-testid="sidebar-project-workspace-list-scroll"]')
      if (!scroller) return
      const targetId = await resolveTargetId()
      // Why: the list interleaves one project name row (sidebar-project-row-*)
      // with its workspace rows; walk them in document order so each workspace
      // row inherits the project name it belongs to.
      const ordered = Array.from(
        scroller.querySelectorAll(
          '[data-testid^="sidebar-project-row-"], [data-testid^="sidebar-workspace-row-"]'
        )
      )
      // First pass: find the project that contains the target workspace. Every
      // workspace row of that project is part of the current workspace.
      let currentProject = null
      let matchedProject = null
      let matched = 0
      for (const el of ordered) {
        const tid = el.getAttribute('data-testid')
        if (tid.startsWith('sidebar-project-row-')) {
          currentProject = el
          continue
        }
        if (targetId && tid.endsWith(':' + targetId)) {
          matched++
          matchedProject = currentProject
        }
      }
      // Why: removing the non-matching rows from the DOM closes the gap
      // hidden rows would leave; the SPA re-renders new instances on the
      // next observer tick, which we re-process, so no detached pool is
      // needed. Kept rows get pointer-events + cursor reset so the accordion
      // cannot be collapsed and the workspace row cannot navigate away.
      currentProject = null
      for (const el of ordered) {
        const tid = el.getAttribute('data-testid')
        if (tid.startsWith('sidebar-project-row-')) {
          currentProject = el
        }
        const keep = targetId === null || currentProject === matchedProject
        if (keep) {
          el.style.setProperty('pointer-events', 'none', 'important')
          el.style.cursor = 'default'
        } else if (el.parentNode) {
          el.parentNode.removeChild(el)
        }
      }
      // Why: creation entries (Add project / New workspace) and Schedules
      // must not appear in the sidebar; removing them closes any gap and the
      // SPA re-creates them so the observer keeps the sidebar clean.
      document.querySelectorAll(
        '[data-testid="sidebar-add-project"], ' +
        '[data-testid="sidebar-global-new-workspace"], ' +
        '[data-testid="sidebar-schedules"]'
      ).forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el)
      })
    }
    apply()
    guard.observer = new MutationObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(apply, 150)
    })
    guard.observer.observe(document.body, { childList: true, subtree: true })
  })()`
}

/**
 * Inject the guest-side sidebar filter: only the current workspace (matching
 * the Orca worktree path) and its session list stay visible. Best-effort — a
 * failing script never breaks the webview.
 */
export function hidePaseoOtherWorkspaces(
  webview: Electron.WebviewTag,
  url: string,
  worktreePath: string
): void {
  if (!isPaseoWebviewUrl(url)) {
    return
  }
  void webview
    .executeJavaScript(buildPaseoWorkspaceFilterScript(worktreePath))
    .catch(() => undefined)
}

/**
 * Pick the workspace whose directory matches `cwd` from the web app's own
 * replica cache (localStorage "@paseo:replica-cache") and pin the persisted
 * last-workspace selection to it. Returns true when the selection changed.
 */
function selectWorkspaceFromCacheScript(cwd: string): string {
  return `(() => {
    const target = ${JSON.stringify(cwd)}
    const selectionKey = '${PASEO_LAST_WORKSPACE_KEY}'
    try {
      const raw = localStorage.getItem('@paseo:replica-cache')
      if (!raw) return false
      const cache = JSON.parse(raw)
      const hosts = Array.isArray(cache) ? cache : cache.hosts
      if (!Array.isArray(hosts)) return false
      for (const host of hosts) {
        const workspaces = host.workspaces || []
        for (const ws of workspaces) {
          if (ws.workspaceDirectory === target && ws.id) {
            const value = JSON.stringify({ serverId: host.serverId, workspaceId: ws.id })
            if (localStorage.getItem(selectionKey) === value) return false
            localStorage.setItem(selectionKey, value)
            return true
          }
        }
      }
    } catch (e) { /* ignore malformed cache */ }
    return false
  })()`
}

/**
 * Write the workspace selection for Orca's active worktree into the web app's
 * persisted state (localStorage), then reload so the app hydrates on it.
 * Priority: exact attach result → resolve from the replica cache by cwd →
 * clear the stale selection so the URL route wins.
 */
export function preparePaseoWebview(
  webview: Electron.WebviewTag,
  pageId: string,
  url: string
): void {
  if (!isPaseoWebviewUrl(url)) {
    return
  }
  const pending = pendingSelections.get(pageId)
  if (pending) {
    pendingSelections.delete(pageId)
    pendingCwds.delete(pageId)
    // Why: value shape matches the app's LastWorkspaceSelection storage (strict
    // { serverId, workspaceId } JSON) so hydration accepts it.
    const value = JSON.stringify(pending)
    void webview
      .executeJavaScript(
        `localStorage.setItem('${PASEO_LAST_WORKSPACE_KEY}', ${JSON.stringify(value)})`
      )
      .then(() => webview.reload())
      .catch(() => undefined)
    return
  }
  const cwd = pendingCwds.get(pageId)
  if (cwd) {
    pendingCwds.delete(pageId)
    void webview
      .executeJavaScript(selectWorkspaceFromCacheScript(cwd))
      .then((changed: unknown) => {
        if (changed === true) {
          webview.reload()
        }
      })
      .catch(() => undefined)
    return
  }
  void webview
    .executeJavaScript(`(() => {
      if (sessionStorage.getItem('${PASEO_RESET_MARKER_KEY}')) return false
      const had = localStorage.getItem('${PASEO_LAST_WORKSPACE_KEY}') !== null
      localStorage.removeItem('${PASEO_LAST_WORKSPACE_KEY}')
      sessionStorage.setItem('${PASEO_RESET_MARKER_KEY}', '1')
      return had
    })()`)
    .then((hadSelection: unknown) => {
      if (hadSelection === true) {
        webview.reload()
      }
    })
    .catch(() => undefined)
}
