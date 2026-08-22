/**
 * Injected behavior for the embedded Reasonix web app. The Reasonix host is
 * per-project (one loopback server pinned to a project's deterministic port),
 * so the web app's current project is read from its own `/status` cwd folder.
 * The match overlay surfaces whether that project equals Orca's active
 * worktree and, on a mismatch, force-recovers: stop the per-project server,
 * restart it on the worktree's port, and reload the webview.
 */
import { buildReasonixMatchOverlayScript } from './reasonix-match-overlay-script'

// Why: Reasonix serves its SPA from the loopback root (like DeepSeek Harness),
// so this pattern alone cannot tell them apart — browser-pane injections gate
// on webViewAgentType in addition to this URL shape to avoid cross-injecting
// the Reasonix pill into a DeepSeek webview.
const REASONIX_WEBVIEW_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/?(\?.*)?$/

export function isReasonixWebviewUrl(url: string): boolean {
  return REASONIX_WEBVIEW_URL_PATTERN.test(url)
}

/**
 * Inject the bottom-right match-status pill into the Reasonix web UI. Shows
 * whether the SPA's current project matches the Orca worktree; clicking (or a
 * persistent mismatch after the boot grace) force-recovers: stop the project
 * server, restart it on the worktree's deterministic port, and reload.
 * Best-effort.
 */
export function injectReasonixMatchOverlay(
  webview: Electron.WebviewTag,
  url: string,
  worktreePath: string
): void {
  if (!isReasonixWebviewUrl(url)) {
    return
  }
  void webview
    .executeJavaScript(buildReasonixMatchOverlayScript(worktreePath))
    .catch(() => undefined)
}

/**
 * Force-recover a Reasonix webview onto the given worktree. Because the host
 * is per-project, stopping the current server and restarting it against the
 * worktree on its deterministic port is the reliable convergence path; the tab
 * is then reloaded onto the clean origin.
 */
export async function forceRecoverReasonix(
  webview: Electron.WebviewTag,
  worktreePath: string
): Promise<void> {
  try {
    await window.api.reasonixWeb.stopProject(worktreePath).catch(() => undefined)
    await window.api.reasonixWeb.start(worktreePath)
    const url = webview.getURL()
    try {
      await webview.loadURL(url)
    } catch {
      try {
        webview.reload()
      } catch {
        // Why: reload before dom-ready is transient; the next injection pass
        // re-injects the pill, which retries recovery.
      }
    }
  } catch {
    // Best-effort — the next poll/injection pass retries.
  }
}

/**
 * Listen for the guest's `[orca:reasonix] force-recover` console marker and
 * escalate: stop the project server, restart it on the worktree's port, and
 * reload. Cooldown prevents the SPA from re-triggering recovery in a loop.
 */
export function listenForReasonixForceRecover(
  webview: Electron.WebviewTag,
  worktreePath: string
): void {
  const cooldownKey = `orcaRnxForceCooldown:${worktreePath}`
  const expiredCooldown = (): boolean => {
    const stamp = Number(sessionStorage.getItem(cooldownKey) || 0)
    // Why: stale cooldowns must not silence recovery forever — previous code
    // only checked key existence, sticking the tab in permanent no-recover.
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
      !event.message.includes('[orca:reasonix] force-recover')
    ) {
      return
    }
    if (expiredCooldown()) {
      return
    }
    // Why: 30s — long enough to avoid a recover loop, short enough that the
    // pill stays responsive and can retry after a slow restart.
    sessionStorage.setItem(cooldownKey, String(Date.now() + 30_000))
    void forceRecoverReasonix(webview, worktreePath)
  }
  webview.addEventListener('console-message', onConsoleMessage as EventListener)
}
