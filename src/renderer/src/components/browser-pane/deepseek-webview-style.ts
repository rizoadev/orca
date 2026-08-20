/**
 * Injected behavior for the embedded DeepSeek Harness web app. Pins the web
 * app's current-session localStorage key to the session whose cwd matches
 * Orca's active worktree, then reloads so the SPA hydrates onto it.
 */

// Why: the Harness web UI switches project by writing this exact key
// ({ sessionId }) to localStorage; matching its shape makes hydration accept it.
const DEEPSEEK_CURRENT_SESSION_KEY = 'dsh.sessions.current'

// Why: the web host serves the SPA from the loopback root (no /h/ prefix);
// Paseo lives under /h/, so the two never overlap.
const DEEPSEEK_WEBVIEW_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/?$/

const pendingSessions = new Map<string, string>()

export function queueDeepSeekSession(pageId: string, sessionId: string): void {
  pendingSessions.set(pageId, sessionId)
}

export function isDeepSeekWebviewUrl(url: string): boolean {
  return DEEPSEEK_WEBVIEW_URL_PATTERN.test(url)
}

/** Set the current session for the active worktree and reload once. */
export function prepareDeepSeekWebview(
  webview: Electron.WebviewTag,
  pageId: string,
  url: string
): void {
  if (!isDeepSeekWebviewUrl(url)) {
    return
  }
  const sessionId = pendingSessions.get(pageId)
  if (sessionId) {
    pendingSessions.delete(pageId)
    const value = JSON.stringify({ sessionId })
    void webview
      .executeJavaScript(
        `localStorage.setItem('${DEEPSEEK_CURRENT_SESSION_KEY}', ${JSON.stringify(value)})`
      )
      .then(() => webview.reload())
      .catch(() => undefined)
  }
}
