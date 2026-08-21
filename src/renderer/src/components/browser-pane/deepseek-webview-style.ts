/**
 * Injected behavior for the embedded DeepSeek Harness web app. Pins the web
 * app's current-session localStorage key to the session whose cwd matches
 * Orca's active worktree, then reloads so the SPA hydrates onto it.
 */
import { useAppStore } from '@/store'
import { buildDeepSeekMatchOverlayScript } from './deepseek-match-overlay-script'

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

/**
 * Inject the bottom-right match-status pill into the Harness web UI. Shows
 * whether the SPA's current session resolves to the Orca worktree; clicking
 * (or a persistent mismatch after the boot grace) force-recovers: the host
 * stops, restarts, and re-pins the matching session. Best-effort.
 */
export function injectDeepSeekMatchOverlay(
  webview: Electron.WebviewTag,
  url: string,
  worktreePath: string
): void {
  if (!isDeepSeekWebviewUrl(url)) {
    return
  }
  void webview
    .executeJavaScript(buildDeepSeekMatchOverlayScript(worktreePath))
    .catch(() => undefined)
}

/**
 * Force-recover a Harness host whose SPA will not converge on the worktree
 * session even after repeated re-pins (stale session id, or an SPA that keeps
 * reverting it). Stops the host, restarts it against the worktree, re-pins the
 * matching session, and reloads the webview onto the clean origin.
 */
export async function forceRecoverDeepSeek(
  webview: Electron.WebviewTag,
  worktreePath: string
): Promise<void> {
  try {
    await window.api.deepseekWeb.stop()
    const status = await window.api.deepseekWeb.start(worktreePath)
    const url = status.url ?? webview.getURL()
    // Why: the SPA reads its current session on boot; re-pin the session whose
    // cwd matches the worktree BEFORE the SPA hydrates so the fresh page lands
    // on the right project instead of an unset/stale session (which would leave
    // the pill red and trigger another force-recover).
    const sessions = await window.api.deepseekWeb.listSessions().catch(() => [])
    const match = sessions.find((session) => session.cwd === worktreePath)
    if (match) {
      try {
        await webview.executeJavaScript(
          `localStorage.setItem('${DEEPSEEK_CURRENT_SESSION_KEY}', ${JSON.stringify(JSON.stringify({ sessionId: match.sessionId }))})`
        )
      } catch {
        // Best-effort — poll/inject re-pins on the next pass.
      }
    }
    try {
      await webview.loadURL(url)
    } catch {
      try {
        webview.reload()
      } catch {
        // Why: reload before dom-ready is transient; the next pin pass retries.
      }
    }
  } catch {
    // Best-effort — the next poll/injection pass retries.
  }
}

/**
 * Listen for the guest's `[orca:deepseek] force-recover` console marker and
 * escalate: stop the host, restart it against the worktree, re-pin the
 * matching session, and reload. Cooldown prevents the SPA from re-triggering
 * recovery in a tight loop.
 */
export function listenForDeepSeekForceRecover(
  webview: Electron.WebviewTag,
  worktreePath: string
): void {
  const cooldownKey = `orcaDsForceCooldown:${worktreePath}`
  // Why: stale cooldowns must not silence recovery forever — previous code
  // only checked key existence, sticking the tab in permanent no-recover.
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
      !event.message.includes('[orca:deepseek] force-recover')
    ) {
      return
    }
    if (expiredCooldown()) {
      return
    }
    // Why: 30s — long enough to avoid a recover loop, short enough that the
    // pill stays responsive and can retry after a slow restart.
    sessionStorage.setItem(cooldownKey, String(Date.now() + 30_000))
    void forceRecoverDeepSeek(webview, worktreePath)
  }
  webview.addEventListener('console-message', onConsoleMessage as EventListener)
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
      .then(() => {
        // Why: Electron throws synchronously if reload() runs before the
        // guest is dom-ready; the throw is transient (a racing navigation) and
        // would take down the hosting page via React's error boundary. The
        // next dom-ready pin pass re-attempts.
        try {
          webview.reload()
        } catch {
          // Best-effort — a follow-up pin/reload re-runs on dom-ready.
        }
      })
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
