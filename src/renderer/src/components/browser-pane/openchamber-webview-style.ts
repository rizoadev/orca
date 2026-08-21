/**
 * Injected behavior for the embedded OpenChamber web app. Pins the web app's
 * persisted working directory to Orca's active worktree by writing its
 * `lastDirectory` localStorage key (a raw path string, not JSON — matching
 * useDirectoryStore), then reloads so the SPA hydrates onto it.
 */

// Why: the OpenChamber web UI restores its working directory from this exact
// localStorage key on boot (useDirectoryStore reads it via
// getDeferredSafeStorage, which stores raw strings). Writing the raw path
// makes the SPA target the worktree the tab was opened from.
const OPENCHAMBER_LAST_DIRECTORY_KEY = 'lastDirectory'

// Why: OpenChamber serves its SPA from the loopback root; keep this pattern
// narrow so browser-pane injections never touch Paseo (/h/) or other hosts.
// Orca appends a cache-busting query (?orcaWorktree=…) to force a navigation
// when the active worktree changes, so the pattern accepts an optional query.
const OPENCHAMBER_WEBVIEW_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/?(?:\?[^\s]*)?$/

const pendingDirectories = new Map<string, string>()

export function queueOpenChamberDirectory(pageId: string, directory: string): void {
  pendingDirectories.set(pageId, directory)
}

export function isOpenChamberWebviewUrl(url: string): boolean {
  return OPENCHAMBER_WEBVIEW_URL_PATTERN.test(url)
}

/**
 * Build a cache-busted URL for the OpenChamber SPA carrying the target
 * worktree path. The SPA ignores the query, but the changed URL forces the
 * embedded webview to navigate, which re-fires dom-ready where the
 * localStorage pin is written (see prepareOpenChamberWebview).
 */
export function openChamberUrlForDirectory(baseUrl: string, directory: string): string {
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}orcaWorktree=${encodeURIComponent(directory)}`
}

/** Remove an existing orcaWorktree query so the URL can be re-built for a new one. */
export function stripOpenChamberQuery(url: string): string {
  return url.replace(/[?&]orcaWorktree=[^&]*/g, '').replace(/[?&]$/, '')
}

/** Set the working directory for the active worktree and reload once. */
export function prepareOpenChamberWebview(
  webview: Electron.WebviewTag,
  pageId: string,
  url: string
): void {
  if (!isOpenChamberWebviewUrl(url)) {
    return
  }
  const directory = pendingDirectories.get(pageId)
  if (directory) {
    pendingDirectories.delete(pageId)
    void webview
      .executeJavaScript(
        `localStorage.setItem('${OPENCHAMBER_LAST_DIRECTORY_KEY}', ${JSON.stringify(directory)})`
      )
      .then(() => webview.reload())
      .catch(() => undefined)
  }
}
