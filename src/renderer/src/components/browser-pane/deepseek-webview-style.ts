/**
 * Injected behavior for the embedded DeepSeek Harness web app. Pins the web
 * app's current-session localStorage key to the session whose cwd matches
 * Orca's active worktree, then reloads so the SPA hydrates onto it.
 */
import { useAppStore } from '@/store'

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

/**
 * Surface a cwd mismatch inside the Harness SPA and offer a force re-pin.
 * The pin+reload can silently fail (stale tab, SPA not hydrating), so open
 * the Orca modal that offers Force reload / Force attach against the worktree
 * that should be shown.
 */
export function alertDeepSeekCwdMismatch(
  webview: Electron.WebviewTag,
  pageId: string,
  expectedCwd: string,
  worktreeId?: string
): void {
  void webview
    .executeJavaScript(
      `(() => {
        try {
          const raw = localStorage.getItem('${DEEPSEEK_CURRENT_SESSION_KEY}')
          if (!raw) return null
          const parsed = JSON.parse(raw)
          return typeof parsed.sessionId === 'string' ? parsed.sessionId : null
        } catch { return null }
      })()`
    )
    .then((sessionId: unknown) => {
      console.info(
        `[deepseek] cwd check page=${pageId} expected=${expectedCwd} session=${String(sessionId)}`
      )
      if (typeof sessionId !== 'string') {
        return
      }
      void window.api.deepseekWeb.listSessions().then((sessions) => {
        const session = sessions.find((candidate) => candidate.sessionId === sessionId)
        if (!session || session.cwd === expectedCwd) {
          return
        }
        useAppStore.getState().openModal('deepseek-cwd-mismatch', {
          worktreeId: worktreeId ?? '',
          pageId,
          expectedCwd,
          shownCwd: session.cwd
        })
      })
    })
    .catch(() => undefined)
}
