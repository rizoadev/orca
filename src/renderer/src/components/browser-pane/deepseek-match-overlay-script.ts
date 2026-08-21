/**
 * Guest-side script that renders the DeepSeek Harness match-status pill and,
 * while the SPA's current session lives outside the Orca worktree, a
 * full-screen blocker that stops typing into the wrong project. Kept in its
 * own module so the host-side pin/recover logic stays small; this file is one
 * responsibility: building that injected script string.
 *
 * Unlike OpenChamber (whose pin is a raw path), the Harness pin is a session
 * id (`dsh.sessions.current`), so the guest resolves the session's cwd through
 * the same POST-RPC envelope the host client uses before comparing it to the
 * Orca worktree path.
 */

// Why: the SPA hydrates its current session from localStorage once at boot, so
// a stale pin can only be fixed by re-pinning the matching session before the
// next boot. The grace lets a fresh tab's queued pin settle; the throttle stops
// a reload storm from signaling the host every tick; a single cheap in-page
// auto-reload retries the pin before the heavier host force-recover.
const FORCE_GRACE_MS = 3_000
const FORCE_SIGNAL_THROTTLE_MS = 10_000
const BLOCKER_AUTO_RELOAD_MS = 5_000

/**
 * Build the guest-side match-status overlay script. Renders a small pill at
 * the bottom-right of the Harness web UI showing whether the SPA's current
 * session (`dsh.sessions.current`, a session id) resolves to the Orca worktree
 * path — green ✓ when it matches, red ✗ (with the mismatching folder name)
 * when it does not. While it mismatches, a full-screen blocker covers the page
 * and captures keyboard/input so nothing is typed into the wrong project, then
 * auto-reloads once before signaling the host to force-recover (stop + restart
 * + re-pin). The pill polls the session RPC and clicking it forces recovery.
 * Guarded on `window` so re-injections replace — not stack — the interval,
 * element, and listeners.
 */
export function buildDeepSeekMatchOverlayScript(worktreePath: string): string {
  return `(() => {
    const target = ${JSON.stringify(worktreePath)}
    const guard = (window.__orcaDsOverlay ?? (window.__orcaDsOverlay = {}))
    if (guard.timer) clearInterval(guard.timer)
    const norm = (p) => (p || '').replace(/[\\\\/]+$/, '')
    const folderOf = (p) => p.split(/[\\\\/]+/).filter(Boolean).pop() || p
    let rpcSeq = 0
    // Why: the Harness pin stores a session id, not a path; resolve it to a
    // cwd through the same RPC envelope the host client speaks so the pill can
    // compare paths without any host-side polling.
    const resolveSessionCwd = async () => {
      let sessionId = null
      try {
        const raw = localStorage.getItem('dsh.sessions.current')
        if (raw) sessionId = JSON.parse(raw).sessionId
      } catch {
        return null
      }
      if (!sessionId) return null
      try {
        const res = await fetch(location.origin + '/api/session.list', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'orca-guest-' + Date.now() + '-' + rpcSeq++,
            method: 'session.list',
            payload: {}
          })
        })
        const body = await res.json()
        const items = body && body.result && body.result.value && body.result.value.items
        if (!Array.isArray(items)) return null
        const found = items.find((s) => s && s.sessionId === sessionId)
        return found && typeof found.cwd === 'string' ? found.cwd : null
      } catch {
        return null
      }
    }
    if (!guard.el) {
      guard.el = document.createElement('div')
      guard.el.setAttribute('data-orca-ds-match', '')
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
        // stops, restarts, and re-pins the matching session.
        console.log('[orca:deepseek] force-recover')
      })
      document.body.appendChild(guard.el)
      // Why: a full-screen blocker over the SPA while the session mismatches
      // stops accidental typing into the wrong project. Intercepts both visual
      // clicks (covering layer) and keyboard/input at capture phase.
      guard.blocker = document.createElement('div')
      guard.blocker.setAttribute('data-orca-ds-blocker', '')
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
      const last = Number(sessionStorage.getItem('orcaDsLastForcedAt') || 0)
      // Why: a persistent flag would silence recovery forever after one failed
      // force-recover; a persisted timestamp lets the guest retry after the
      // host's 30s cooldown instead of leaving the blocker up indefinitely.
      if (last && Date.now() - last < ${FORCE_SIGNAL_THROTTLE_MS}) return
      sessionStorage.setItem('orcaDsLastForcedAt', String(Date.now()))
      // Why: the host listens for this marker on the webview's
      // console-message and escalates to stop + restart + re-pin; the SPA then
      // boots onto the freshly re-pinned session for the worktree.
      console.log('[orca:deepseek] force-recover')
    }
    const check = async () => {
      // Why: the SPA can replace body content without navigating; re-append the
      // pill so the status overlay is self-healing between full reloads.
      if (!guard.el.isConnected) document.body.appendChild(guard.el)
      const current = await resolveSessionCwd()
      const match = current !== null && norm(current) === norm(target)
      dot.style.background = match ? '#22c55e' : '#ef4444'
      label.textContent = match
        ? '✓ ' + folderOf(target)
        : '✗ ' + (current ? folderOf(current) : '(unset)')
      guard.el.title = 'target: ' + target + '\\ncurrent: ' + (current ?? '(unset)') + '\\nclick: force recover'
      if (match) {
        sessionStorage.removeItem('orcaDsForceSignaled')
        sessionStorage.removeItem('orcaDsLastForcedAt')
        sessionStorage.removeItem('orcaDsBootedAt')
        sessionStorage.removeItem('orcaDsAutoReloaded')
        guard.lastForcedAt = null
        guard.setBlocked(false)
        return
      }
      guard.setBlocked(true)
      // Why: bootedAt/autoReloaded live in sessionStorage, NOT on the guard
      // object — a reload creates a fresh window/guard, so in-memory flags
      // reset every time and the auto-reload branch repeats forever, never
      // reaching the force-recover signal (blocker stuck indefinitely).
      if (!sessionStorage.getItem('orcaDsBootedAt')) {
        sessionStorage.setItem('orcaDsBootedAt', String(Date.now()))
      }
      if (Date.now() - Number(sessionStorage.getItem('orcaDsBootedAt')) < ${FORCE_GRACE_MS}) return
      // Why: one cheap in-page auto-reload retries the pin before escalating to
      // the heavier host force-recover; guarded so a stubborn SPA does not
      // reload forever.
      if (!sessionStorage.getItem('orcaDsAutoReloaded')) {
        sessionStorage.setItem('orcaDsAutoReloaded', '1')
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
    void check()
    guard.timer = setInterval(() => void check(), 1500)
  })()`
}
