/**
 * Guest-side script that renders the Reasonix match-status pill and, while the
 * web app's project folder mismatches the Orca worktree, a full-screen blocker
 * that stops typing into the wrong project. Kept in its own module so the
 * host-side pin/recover logic stays small; this file is one responsibility:
 * building that injected script string.
 *
 * Unlike DeepSeek (whose pin lives in a `dsh.sessions.current` session id) the
 * Reasonix host is per-project, so the web app's current project is read from
 * its own `/status` endpoint: `cwd` is the project's sessions directory under
 * `~/.reasonix/projects/<encoded>/sessions`, where `<encoded>` is the project
 * path with every `/` collapsed to `-` (e.g. `/home/rizoa/WORKD/orca` →
 * `-home-rizoa-WORKD-orca`). Matching by encoding the Orca worktree the same
 * way avoids an ambiguous reverse-hash.
 */

// Why: a stale pin can only be fixed by restarting the per-project host on the
// worktree's deterministic port. The grace lets a fresh tab's start settle; the
// throttle stops a reload storm from signaling the host every tick; a single
// cheap in-page auto-reload retries before the heavier host force-recover.
const FORCE_GRACE_MS = 3_000
const FORCE_SIGNAL_THROTTLE_MS = 10_000
const BLOCKER_AUTO_RELOAD_MS = 5_000

/**
 * Build the guest-side match-status overlay script. Renders a small pill at the
 * bottom-right of the Reasonix web UI showing whether the web app's current
 * project (its `/status` cwd folder) matches the Orca worktree — green ✓ when
 * it matches, red ✗ (with the mismatching folder name) when it does not. While
 * it mismatches, a full-screen blocker covers the page and captures
 * keyboard/input so nothing is typed into the wrong project, then auto-reloads
 * once before signaling the host to force-recover (stop + restart + reload).
 * Clicking the pill forces recovery. Guarded on `window` so re-injections
 * replace — not stack — the interval, element, and listeners.
 */
export function buildReasonixMatchOverlayScript(worktreePath: string): string {
  return `(() => {
    const target = ${JSON.stringify(worktreePath)}
    const guard = (window.__orcaRnxOverlay ?? (window.__orcaRnxOverlay = {}))
    if (guard.timer) clearInterval(guard.timer)
    const norm = (p) => (p || '').replace(
      /[\\\\/]+$/, '',
    )
    const folderOf = (p) => (p || '').split(/[\\\\/]+/).filter(Boolean).pop() || p
    // Why: Reasonix stores each project under ~/.reasonix/projects/<encoded>
    // where <encoded> = path with every '/' collapsed to '-'. Encoding the
    // target the same way and comparing to the /status cwd folder avoids an
    // ambiguous reverse-hash of the session path.
    const encodeProject = (p) => ('/' + norm(p).replace(/^\\//, '').replace(/\\//g, '-')).replace(/^\\//, '-')
    const resolveProjectFolder = async () => {
      try {
        const res = await fetch(location.origin + '/status', { signal: AbortSignal.timeout(4000) })
        if (!res.ok) return null
        const body = await res.json()
        // Why: cwd is .../projects/<encoded>/sessions; the parent folder name
        // is the encoded project path.
        const cwd = typeof body?.cwd === 'string' ? body.cwd : null
        if (!cwd) return null
        const parts = cwd.split('/')
        const sIdx = parts.lastIndexOf('sessions')
        return sIdx >= 1 ? parts[sIdx - 1] : null
      } catch {
        return null
      }
    }
    if (!guard.el) {
      guard.el = document.createElement('div')
      guard.el.setAttribute('data-orca-rnx-match', '')
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
        // Why: click forces a full recover instead of a re-pin+reload — the
        // per-project host handles only its own port, so restarting it on the
        // worktree's deterministic port is the reliable convergence path.
        console.log('[orca:reasonix] force-recover')
      })
      document.body.appendChild(guard.el)
      // Why: a full-screen blocker over the SPA while the project mismatches
      // stops accidental typing into the wrong project. Intercepts both visual
      // clicks (covering layer) and keyboard/input at capture phase.
      guard.blocker = document.createElement('div')
      guard.blocker.setAttribute('data-orca-rnx-blocker', '')
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
      const last = Number(sessionStorage.getItem('orcaRnxLastForcedAt') || 0)
      // Why: a persisted timestamp lets the guest retry after the host cooldown
      // instead of leaving the blocker up indefinitely.
      if (last && Date.now() - last < ${FORCE_SIGNAL_THROTTLE_MS}) return
      sessionStorage.setItem('orcaRnxLastForcedAt', String(Date.now()))
      console.log('[orca:reasonix] force-recover')
    }
    const check = async () => {
      // Why: the SPA can replace body content without navigating; re-append the
      // pill so the status overlay is self-healing between full reloads.
      if (!guard.el.isConnected) document.body.appendChild(guard.el)
      const currentEncoded = await resolveProjectFolder()
      const targetEncoded = encodeProject(target)
      const match = currentEncoded !== null && currentEncoded === targetEncoded
      dot.style.background = match ? '#22c55e' : '#ef4444'
      label.textContent = match
        ? '✓ ' + folderOf(target)
        : '✗ ' + (currentEncoded ? currentEncoded.replace(/^-/, '') : '(unset)')
      guard.el.title = 'target: ' + target + '\\ncurrent: ' + (currentEncoded ?? '(unset)') + '\\nclick: force recover'
      if (match) {
        sessionStorage.removeItem('orcaRnxForceSignaled')
        sessionStorage.removeItem('orcaRnxLastForcedAt')
        sessionStorage.removeItem('orcaRnxBootedAt')
        sessionStorage.removeItem('orcaRnxAutoReloaded')
        guard.lastForcedAt = null
        guard.setBlocked(false)
        return
      }
      guard.setBlocked(true)
      // Why: bootedAt/autoReloaded live in sessionStorage, NOT on the guard
      // object — a reload creates a fresh window/guard, so in-memory flags
      // reset every time and the auto-reload branch repeats forever.
      if (!sessionStorage.getItem('orcaRnxBootedAt')) {
        sessionStorage.setItem('orcaRnxBootedAt', String(Date.now()))
      }
      if (Date.now() - Number(sessionStorage.getItem('orcaRnxBootedAt')) < ${FORCE_GRACE_MS}) return
      if (!sessionStorage.getItem('orcaRnxAutoReloaded')) {
        sessionStorage.setItem('orcaRnxAutoReloaded', '1')
        window.setTimeout(() => location.reload(), ${BLOCKER_AUTO_RELOAD_MS})
        return
      }
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
