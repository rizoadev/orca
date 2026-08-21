import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { useActiveWorktree, useActiveWorktreeId } from '@/store/selectors'
import { queueOpenChamberDirectory } from '@/components/browser-pane/openchamber-webview-style'

/**
 * Keeps the OpenChamber web server's OpenCode working directory pointed at
 * Orca's active worktree. Switching worktrees re-attaches the server, so the
 * web app's session list and new sessions target the folder the user is
 * looking at. The server is single-instance and directory-scoped, so this is
 * an attach (not a restart like DeepSeek's per-worktree host).
 *
 * The already-loaded tab must also be re-targeted: its SPA reads
 * localStorage on boot, so the follow queues the new directory and reloads
 * the tab (via reloadBrowserPage) so the dom-ready handler writes the pin and
 * the SPA hydrates onto the new worktree.
 */
export function useOpenChamberWorktreeFollow(): void {
  const activeWorktreeId = useActiveWorktreeId()
  const activeWorktree = useActiveWorktree()
  // Why: remember the last worktree we re-targeted so opening a fresh tab
  // (which already queues the directory in open-openchamber-tab.ts) does not
  // trigger a redundant reload; only a real worktree switch does.
  const lastTargetedPathRef = useRef<string | null>(null)
  // Why: re-run when the OpenChamber tab appears (restored on launch or opened
  // via New Tab), not only when the worktree changes — a restored tab may
  // still point at an older directory.
  const openChamberTabExists = useAppStore((state) =>
    (activeWorktreeId ? (state.browserTabsByWorktree[activeWorktreeId] ?? []) : []).some(
      (tab) => tab.title === 'OpenChamber'
    )
  )

  useEffect(() => {
    const path = activeWorktree?.path
    if (!path || !activeWorktreeId) {
      return
    }
    let cancelled = false
    void (async () => {
      const state = useAppStore.getState()
      const tab = (state.browserTabsByWorktree[activeWorktreeId] ?? []).find(
        (t) => t.title === 'OpenChamber'
      )
      // Why: only re-target an already-open OpenChamber tab; opening one runs
      // the same attach in open-openchamber-tab.ts.
      if (!tab) {
        return
      }
      try {
        const status = await window.api.openchamberWeb.getStatus()
        if (cancelled || status.state !== 'running') {
          return
        }
        await window.api.openchamberWeb.attachDirectory(path)
        console.info(`[openchamber] follow worktree=${path}`)
        // Why: re-pin the SPA's localStorage-backed directory and reload the
        // tab so it hydrates onto this worktree, not a stale last-loaded one.
        const pageId = tab.activePageId ?? tab.pageIds?.[0]
        if (pageId) {
          queueOpenChamberDirectory(pageId, path)
          // Why: only reload on an actual worktree switch; the initial tab
          // open already queues + reloads via its own dom-ready path.
          if (lastTargetedPathRef.current !== path) {
            lastTargetedPathRef.current = path
            state.reloadBrowserPage(pageId)
          }
        }
      } catch {
        // Best-effort — the server may be starting or already attached.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeWorktreeId, activeWorktree?.path, openChamberTabExists])
}
