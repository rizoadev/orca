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
const OPENCHAMBER_WEBVIEW_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/?$/

const pendingDirectories = new Map<string, string>()

export function queueOpenChamberDirectory(pageId: string, directory: string): void {
  pendingDirectories.set(pageId, directory)
}

export function isOpenChamberWebviewUrl(url: string): boolean {
  return OPENCHAMBER_WEBVIEW_URL_PATTERN.test(url)
}

/** Set the working directory for the active worktree and reload once. */
export function prepareOpenChamberWebview(
  webview: Electron.WebviewTag,
  pageId: string,
  url: string
): void {
  console.info(
    `[openchamber] prepare called url=${url} page=${pageId} pattern=${OPENCHAMBER_WEBVIEW_URL_PATTERN.test(url)}`
  )
  if (!isOpenChamberWebviewUrl(url)) {
    return
  }
  const directory = pendingDirectories.get(pageId)
  console.info(`[openchamber] prepare url=${url} page=${pageId} dir=${directory ?? 'none'}`)
  if (directory) {
    pendingDirectories.delete(pageId)
    void webview
      .executeJavaScript(
        `localStorage.setItem('${OPENCHAMBER_LAST_DIRECTORY_KEY}', ${JSON.stringify(directory)})`
      )
      .then((res) => {
        console.info(`[openchamber] pin set result=${JSON.stringify(res)} dir=${directory}`)
        webview.reload()
      })
      .catch((err) => console.warn('[openchamber] pin failed', err))
  }
}
