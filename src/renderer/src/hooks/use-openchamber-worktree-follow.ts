import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { useActiveWorktree, useActiveWorktreeId } from '@/store/selectors'
import {
  queueOpenChamberDirectory,
  openChamberUrlForDirectory
} from '@/components/browser-pane/openchamber-webview-style'

/**
 * Keeps the OpenChamber web server's OpenCode working directory pointed at
 * Orca's active worktree. Switching worktrees re-attaches the server, so the
 * web app's session list and new sessions target the folder the user is
 * looking at. The server is single-instance and directory-scoped, so this is
 * an attach (not a restart like DeepSeek's per-worktree host).
 *
 * The already-loaded tab must also be re-targeted: its SPA reads
 * localStorage on boot, so the follow navigates the tab to a cache-busted URL
 * carrying the new worktree path, which triggers a dom-ready where the
 * localStorage pin is written and the SPA reloads onto the new directory.
 */
export function useOpenChamberWorktreeFollow(): void {
  const activeWorktreeId = useActiveWorktreeId()
  const activeWorktree = useActiveWorktree()
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
        if (cancelled || status.state !== 'running' || !status.url) {
          return
        }
        await window.api.openchamberWeb.attachDirectory(path)
        console.info(`[openchamber] follow worktree=${path}`)
        // Why: the SPA hydrates its directory from localStorage on boot; a
        // cache-busted URL forces a navigation so the dom-ready handler writes
        // the pin and the SPA reloads onto the new worktree.
        const pageId = tab.activePageId ?? tab.pageIds?.[0]
        if (pageId) {
          queueOpenChamberDirectory(pageId, path)
          state.setBrowserPageUrl(pageId, openChamberUrlForDirectory(status.url, path))
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
