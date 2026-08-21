/**
 * Guest-side script that renders the OpenChamber match-status pill and, while
 * the SPA's working directory mismatches the Orca worktree, a full-screen
 * blocker that stops typing into the wrong project. Kept in its own module so
 * the host-side pin/recover logic stays small; this file is one responsibility:
 * building that injected script string.
 */

// Why: the SPA hydrates its project from localStorage once at boot, so a stale
// pin can only be fixed by clearing the origin and re-writing the key before the
// next boot. The grace lets a fresh tab's queued pin settle; the throttle stops
// a reload storm from signaling the host every tick; a single cheap in-page
// auto-reload retries the pin before the heavier host force-recover.
const FORCE_GRACE_MS = 3_000
const FORCE_SIGNAL_THROTTLE_MS = 10_000
const BLOCKER_AUTO_RELOAD_MS = 5_000

/**
 * Build the guest-side match-status overlay script. Renders a small pill at
 * the bottom-right of the OpenChamber web UI showing whether the SPA's
 * persisted `lastDirectory` equals the Orca worktree path — green ✓ when it
 * matches, red ✗ (with the mismatching folder name) when it does not. While it
 * mismatches, a full-screen blocker covers the page and captures keyboard/input
 * so nothing is typed into the wrong project, then auto-reloads once before
 * signaling the host to force-recover (kill + clear + restart). The pill polls
 * localStorage (the pin source of truth the SPA hydrates from) and clicking it
 * forces recovery. Guarded on `window` so re-injections replace — not stack —
 * the interval, element, and listeners.
 */
export function buildOpenChamberMatchOverlayScript(worktreePath: string): string {
  return `(() => {
    const target = ${JSON.stringify(worktreePath)}
    const guard = (window.__orcaOcOverlay ?? (window.__orcaOcOverlay = {}))
    if (guard.timer) clearInterval(guard.timer)
    const norm = (p) => (p || '').replace(/[\\\\/]+$/, '')
    const folderOf = (p) => p.split(/[\\\\/]+/).filter(Boolean).pop() || p
    if (!guard.el) {
      guard.el = document.createElement('div')
      guard.el.setAttribute('data-orca-oc-match', '')
      const s = guard.el.style
      s.position = 'fixed'
      s.right = '12px'
      s.bottom = '12px'
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
        // Why: click forces a full recover instead of a re-pin+reload, which
        // reloads endlessly when the SPA keeps reverting the pin. The host
        // cleans the origin storage and restarts on the same port.
        console.log('[orca:openchamber] force-recover')
      })
      document.body.appendChild(guard.el)
      // Why: a full-screen blocker over the SPA while the directory mismatches
      // stops accidental typing into the wrong project. Intercepts both visual
      // clicks (covering layer) and keyboard/input at capture phase.
      guard.blocker = document.createElement('div')
      guard.blocker.setAttribute('data-orca-oc-blocker', '')
      Object.assign(guard.blocker.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483646',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(2px)',
        color: '#fbbf24',
        font: '13px ui-monospace, SFMono-Regular, Menlo, monospace',
        textAlign: 'center',
        padding: '24px',
        cursor: 'not-allowed'
      })
      guard.blocker.textContent = '⚠ Wrong project — recovering…'
      document.body.appendChild(guard.blocker)
      // Why: block keys/input only while the blocker is visible; capture phase
      // beats any SPA listener.
      guard.blockInput = (e) => {
        if (!guard.blocked) return
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
      }
      document.addEventListener('keydown', guard.blockInput, true)
      document.addEventListener('keypress', guard.blockInput, true)
      document.addEventListener('input', guard.blockInput, true)
      guard.setBlocked = (blocked) => {
        guard.blocker.style.display = blocked ? 'flex' : 'none'
        guard.blocked = blocked
      }
    }
    const [dot, label] = guard.el.children
    const signal = () => {
      if (sessionStorage.getItem('orcaOcForceSignaled')) return
      sessionStorage.setItem('orcaOcForceSignaled', '1')
      // Why: the host listens for this marker on the webview's
      // console-message and escalates to kill + clear + restart; the SPA then
      // boots onto the freshly re-pinned directory set by the recover path.
      console.log('[orca:openchamber] force-recover')
    }
    const check = () => {
      // Why: the SPA can replace body content without navigating; re-append the
      // pill so the status overlay is self-healing between full reloads.
      if (!guard.el.isConnected) document.body.appendChild(guard.el)
      let current = null
      try {
        current = localStorage.getItem('lastDirectory')
      } catch {
        /* ignore */
      }
      const match = current !== null && norm(current) === norm(target)
      dot.style.background = match ? '#22c55e' : '#ef4444'
      label.textContent = match
        ? '✓ ' + folderOf(target)
        : '✗ ' + (current ? folderOf(current) : '(unset)')
      guard.el.title = 'target: ' + target + '\\ncurrent: ' + (current ?? '(unset)') + '\\nclick: force recover'
      if (match) {
        sessionStorage.removeItem('orcaOcForceSignaled')
        guard.lastForcedAt = null
        guard.setBlocked(false)
        guard.autoReloaded = false
        return
      }
      guard.setBlocked(true)
      // Why: a fresh tab is expected to mismatch briefly while its queued
      // pin+reload settles; force only once that grace has elapsed.
      if (!guard.bootedAt) guard.bootedAt = Date.now()
      if (Date.now() - guard.bootedAt < ${FORCE_GRACE_MS}) return
      // Why: one cheap in-page auto-reload retries the pin before escalating to
      // the heavier host force-recover; guarded so a stubborn SPA does not
      // reload forever.
      if (!guard.autoReloaded) {
        guard.autoReloaded = true
        window.setTimeout(() => location.reload(), ${BLOCKER_AUTO_RELOAD_MS})
        return
      }
      // Why: direct force on first real mismatch — re-pin+reload budgets loop
      // forever when the SPA reverts the key; throttled against reload storms.
      if (
        guard.lastForcedAt &&
        Date.now() - guard.lastForcedAt < ${FORCE_SIGNAL_THROTTLE_MS}
      ) {
        return
      }
      guard.lastForcedAt = Date.now()
      signal()
    }
    check()
    guard.timer = setInterval(check, 1500)
  })()`
}
