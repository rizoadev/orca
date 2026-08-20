/**
 * Injected styling/behavior for the embedded Paseo web app (browser tab).
 * Hides the sidebar workspace list and pins the app's persisted
 * last-workspace selection to the workspace that matches Orca's active
 * worktree, so the chat always runs in the folder the user is looking at.
 */

// Why: the Paseo web app renders its sidebar workspace list with a stable
// data-testid; display:none removes it without touching the rest of the UI.
const PASEO_WORKSPACE_LIST_HIDE_CSS = `
  [data-testid="sidebar-project-workspace-list-scroll"],
  [aria-label="Add project"],
  [aria-label="History"],
  [data-testid="new-workspace-ref-picker-row"] {
    display: none !important;
  }
`

// Why: hide the Paseo sidebar chrome (list, Add project, History, picker).
const PASEO_SIDEBAR_HIDE_ENABLED = true

// Why: the daemon serves the web app on loopback with a dynamic port; any
// path (root, /h/, ...) is part of the Paseo app after SPA redirects, and the
// selectors below are specific enough to never affect other loopback pages.
const PASEO_WEBVIEW_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d+/

// Why: AsyncStorage (web) stores this key verbatim in localStorage; setting it
// pins the app to a specific workspace, clearing it lets the URL route win.
const PASEO_LAST_WORKSPACE_KEY = 'paseo:last-workspace-route-selection'
const PASEO_RESET_MARKER_KEY = 'paseo:selection-reset'

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

export function maybeHidePaseoWorkspaceList(webview: Electron.WebviewTag, url: string): void {
  if (!PASEO_SIDEBAR_HIDE_ENABLED || !isPaseoWebviewUrl(url)) {
    return
  }
  // Why: insertCSS is idempotent per navigation and fails harmlessly on
  // pre-attach states; a rejected promise must not surface to the app.
  webview.insertCSS(PASEO_WORKSPACE_LIST_HIDE_CSS).catch(() => undefined)
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
