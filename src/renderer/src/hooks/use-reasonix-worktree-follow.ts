import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { useActiveWorktree, useActiveWorktreeId } from '@/store/selectors'

/**
 * Keeps the Reasonix web server pointed at Orca's active worktree. Switching
 * worktrees re-attaches (restarting the per-worktree server on its
 * deterministic port), so the web app's chat targets the folder the user is
 * looking at.
 *
 * The already-loaded tab must also be re-targeted: the server is launched
 * scoped to a single --dir, so a worktree switch starts a fresh server on a
 * new port; the follow reloads the tab so it lands on the new origin.
 */
export function useReasonixWorktreeFollow(): void {
  const activeWorktreeId = useActiveWorktreeId()
  const activeWorktree = useActiveWorktree()
  // Why: remember the last worktree we re-targeted so opening a fresh tab
  // (which already starts the server for its worktree) does not trigger a
  // redundant reload; only a real worktree switch does.
  const lastTargetedPathRef = useRef<string | null>(null)
  // Why: re-run when the Reasonix tab appears (restored on launch or opened via
  // New Tab), not only when the worktree changes.
  const reasonixTabExists = useAppStore((state) =>
    (activeWorktreeId ? (state.browserTabsByWorktree[activeWorktreeId] ?? []) : []).some(
      (tab) => tab.title === 'Reasonix'
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
        (t) => t.title === 'Reasonix'
      )
      // Why: only re-target an already-open Reasonix tab; opening one runs the
      // same attach path.
      if (!tab) {
        return
      }
      try {
        const status = await window.api.reasonixWeb.getStatus()
        if (cancelled || status.state !== 'running' || !status.url) {
          return
        }
        await window.api.reasonixWeb.attachDirectory(path)
        console.info(`[reasonix] follow worktree=${path}`)
        // Why: only reload on an actual worktree switch; the initial tab open
        // already starts the server for its own worktree.
        if (lastTargetedPathRef.current !== path) {
          lastTargetedPathRef.current = path
          if (tab.activePageId) {
            state.reloadBrowserPage(tab.activePageId)
          }
        }
      } catch {
        // Best-effort — the server may be starting or already attached.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeWorktreeId, activeWorktree?.path, reasonixTabExists])
}
