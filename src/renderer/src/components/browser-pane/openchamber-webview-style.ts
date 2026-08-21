/**
 * Injected behavior for the embedded OpenChamber web app. Pins the web app's
 * persisted working directory to Orca's active worktree by writing its
 * `lastDirectory` localStorage key (a raw path string, not JSON — matching
 * useDirectoryStore), then reloads so the SPA hydrates onto it.
 */
import { useAppStore } from '@/store'
import { buildOpenChamberMatchOverlayScript } from './openchamber-match-overlay-script'

// Why: the OpenChamber web UI restores its working directory from this exact
// localStorage key on boot (useDirectoryStore reads it via
// getDeferredSafeStorage, which stores raw strings). Writing the raw path
// makes the SPA target the worktree the tab was opened from.
const OPENCHAMBER_LAST_DIRECTORY_KEY = 'lastDirectory'

// Why: OpenChamber serves its SPA from the loopback root; keep this pattern
// narrow so browser-pane injections never touch Paseo (/h/) or other hosts.
// The SPA deep-links into a session with a ?session= query, so the query
// string is allowed — a strict root-only pattern silently skipped the pin and
// every injected behavior for those URLs.
const OPENCHAMBER_WEBVIEW_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/(\?.*)?$/

// Why: reload-only healing (re-pin + reload) loops forever when the SPA
// reverts the key, so a mismatch escalates straight to host-side force-recover
// (kill + clear + restart) — see openchamber-match-overlay-script.ts for the
// guest-side pill/blocker behavior.
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

/**
 * Build the guest-side script that trims the OpenChamber sidebar down to the
 * workspace whose folder matches the given worktree path: the Recent/activity
 * section and every other project are hidden. Project items are the
 * `.oc-sidebar-scroller` children whose header button carries `cursor-grab`
 * (the only such class in the sidebar); the Recent section header never has
 * it, so it is identified and hidden too. The label
 * span is matched by its Tailwind classes (`text-[14px] font-semibold`).
 *
 * A MutationObserver re-applies the filter because the SPA re-renders the
 * sidebar (session joins, expansion toggles) without navigating; it is stored
 * on `window` so repeated injections replace — never stack — observers.
 */
function buildOpenChamberWorkspaceFilterScript(worktreePath: string): string {
  return `(() => {
    const target = ${JSON.stringify(worktreePath)}
    const folder = target.split(/[\\\\/]+/).filter(Boolean).pop() || target
    const guard = (window.__orcaOcFilter ?? (window.__orcaOcFilter = { observer: null }))
    if (guard.observer) guard.observer.disconnect()
    const scrollerSel = '.oc-sidebar-scroller'
    const labelSel = 'span[class*="text-\\[14px\\]"][class*="font-semibold"]'
    let timer = 0
    const apply = () => {
      const scroller = document.querySelector(scrollerSel)
      if (!scroller) return
      // Why: hide the sidebar header's add-project entry point — projects come
      // from Orca worktrees, so an in-app add would desync the session list.
      document.querySelectorAll('[aria-label*="add project" i]').forEach((el) => {
        el.style.display = 'none'
      })
      let matched = 0
      for (const item of Array.from(scroller.children)) {
        const headerBtn = item.querySelector('button.cursor-grab')
        if (!headerBtn) {
          // Why: non-project scroller children are the Recent/activity section;
          // hide it too so only the current workspace's sessions stay visible.
          item.style.display = 'none'
          continue
        }
        const label = (headerBtn.querySelector(labelSel)?.textContent ?? '').trim()
        const keep = label.toLowerCase() === folder.toLowerCase()
        if (keep) matched++
        item.style.display = keep ? '' : 'none'
      }
      // Why: a renamed workspace would otherwise hide everything; fall back to
      // showing all projects (Recent stays hidden) when nothing matches.
      if (matched === 0) {
        for (const item of Array.from(scroller.children)) {
          if (item.querySelector('button.cursor-grab')) item.style.display = ''
        }
      }
    }
    apply()
    guard.observer = new MutationObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(apply, 120)
    })
    guard.observer.observe(document.body, { childList: true, subtree: true })
  })()`
}

/**
 * Hide every OpenChamber sidebar workspace except the one for the current
 * worktree, and hide the Recent/activity section as well. Injected on
 * dom-ready, and re-injected after the pin+reload so a new worktree re-targets
 * the filter. Best-effort: a failing script never breaks the webview.
 */
export function hideOpenChamberOtherWorkspaces(
  webview: Electron.WebviewTag,
  url: string,
  worktreePath: string
): void {
  if (!isOpenChamberWebviewUrl(url)) {
    return
  }
  void webview
    .executeJavaScript(buildOpenChamberWorkspaceFilterScript(worktreePath))
    .catch(() => undefined)
}

/**
 * Inject the bottom-right match-status pill into the OpenChamber web UI.
 * Shows whether the SPA is pinned to the Orca worktree; clicking (or a
 * persistent mismatch after the boot grace) force-recovers: the host kills
 * the server, clears storage, restarts, and re-pins. Best-effort.
 */
export function injectOpenChamberMatchOverlay(
  webview: Electron.WebviewTag,
  url: string,
  worktreePath: string
): void {
  if (!isOpenChamberWebviewUrl(url)) {
    return
  }
  void webview
    .executeJavaScript(buildOpenChamberMatchOverlayScript(worktreePath))
    .catch(() => undefined)
}

/**
 * Reload an OpenChamber webview only once its guest is attached (dom-ready).
 * Electron throws synchronously if reload() runs before dom-ready, which would
 * take down the hosting page via React's error boundary; the throw is transient
 * (a racing navigation), so it is swallowed and later pin/reload passes retry.
 */
export function reloadOpenChamberWebview(
  webview: Electron.WebviewTag | null | undefined,
  ready: boolean
): void {
  if (!webview || !ready) {
    return
  }
  try {
    webview.reload()
  } catch {
    // Why: a reload racing a navigation is transient; follow-up pins re-attempt.
  }
}

/**
 * Force-recover an OpenChamber server whose SPA will not converge on the
 * worktree directory even after repeated re-pins (corrupt lastDirectory, or
 * an SPA that keeps reverting it). Kills the server on its port, clears its
 * origin localStorage/cookies, then restarts on the same deterministic port
 * and reloads the webview onto the clean origin.
 */
export async function forceRecoverOpenChamber(
  webview: Electron.WebviewTag,
  worktreePath: string
): Promise<void> {
  try {
    await window.api.openchamberWeb.stopProject(worktreePath)
    await window.api.openchamberWeb.clearStorage(worktreePath)
    const status = await window.api.openchamberWeb.start(worktreePath)
    const url = status.url ?? webview.getURL()
    // Why: clearStorage wiped lastDirectory too; re-pin BEFORE the SPA boots so
    // the fresh page hydrates onto the worktree instead of an unset directory
    // (which would leave the pill red and trigger another force-recover).
    try {
      await webview.executeJavaScript(
        `localStorage.setItem('lastDirectory', ${JSON.stringify(worktreePath)})`
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
 * Listen for the guest's `[orca:openchamber] force-recover` console marker and
 * escalate: kill the server on its port, clear its origin storage, restart on
 * the same deterministic port, and reload. Cooldown prevents the SPA from
 * re-triggering recovery in a tight loop.
 */
export function listenForOpenChamberForceRecover(
  webview: Electron.WebviewTag,
  worktreePath: string
): void {
  const cooldownKey = `orcaOcForceCooldown:${worktreePath}`
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
      !event.message.includes('[orca:openchamber] force-recover')
    ) {
      return
    }
    if (expiredCooldown()) {
      return
    }
    // Why: 30s — long enough to avoid a recover loop, short enough that the
    // pill stays responsive and can retry after a slow restart.
    sessionStorage.setItem(cooldownKey, String(Date.now() + 30_000))
    void forceRecoverOpenChamber(webview, worktreePath)
  }
  webview.addEventListener('console-message', onConsoleMessage as EventListener)
}

/**
 * Poll an OpenChamber tab until its SPA working directory matches the worktree
 * path. Attempt 0 tries a cheap re-pin+reload (covers a missed queue-pin
 * handoff); any later mismatch escalates to force-recover instead of looping
 * reloads — an SPA that reverts the pin never converges otherwise.
 */
export async function pollOpenChamberDirectorySync(
  webview: Electron.WebviewTag,
  worktreeId: string,
  expectedCwd: string
): Promise<void> {
  const path = useAppStore.getState().getKnownWorktreeById(worktreeId)?.path ?? expectedCwd
  try {
    // Why: re-inject — the pin+reload can tear down the page mid injection, so
    // the settle point is the reliable moment to (re)apply filter + pill.
    const url = webview.getURL()
    hideOpenChamberOtherWorkspaces(webview, url, path)
    injectOpenChamberMatchOverlay(webview, url, path)
    const status = await window.api.openchamberWeb.getStatus()
    if (status.state === 'running' && status.cwd !== path) {
      await window.api.openchamberWeb.attachDirectory(path).catch(() => undefined)
    }
    const current = await webview.executeJavaScript(
      `(() => {
        try {
          const raw = localStorage.getItem('${OPENCHAMBER_LAST_DIRECTORY_KEY}')
          return typeof raw === 'string' ? raw : null
        } catch { return null }
      })()`
    )
    if (current === path) {
      return
    }
    // Why: the pill's auto-heal already forces on a persistent mismatch, so
    // this poll only does the cheap re-pin+reload for a fresh-tab handoff;
    // a mismatching SPA converges via the pill's kill + clear + restart.
    await webview
      .executeJavaScript(
        `localStorage.setItem('${OPENCHAMBER_LAST_DIRECTORY_KEY}', ${JSON.stringify(path)})`
      )
      .catch(() => undefined)
    webview.reload()
  } catch {
    // Why: transient (page loading / host starting) — the pill retries.
  }
}
