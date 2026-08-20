import { useEffect } from 'react'
import { useAppStore } from '@/store'
import { useActiveWorktree, useActiveWorktreeId } from '@/store/selectors'
import {
  queuePaseoCwd,
  queuePaseoWorkspaceSelection
} from '@/components/browser-pane/paseo-webview-style'

/**
 * Keeps the open Paseo browser tab pointed at the same directory as Orca's
 * active worktree. Switching worktrees re-attaches the Paseo project and
 * navigates the tab to the matching workspace route, so the chat always runs
 * in the folder the user is looking at.
 */
export function usePaseoWorktreeFollow(): void {
  const activeWorktreeId = useActiveWorktreeId()
  const activeWorktree = useActiveWorktree()
  // Why: re-run when the Paseo tab appears (restored on launch or opened via
  // New Tab), not only when the worktree changes — a restored tab may still
  // point at an older workspace URL.
  const paseoTabExists = useAppStore((state) =>
    (activeWorktreeId ? (state.browserTabsByWorktree[activeWorktreeId] ?? []) : []).some(
      (tab) => tab.title === 'Paseo'
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
      const workspace = (state.browserTabsByWorktree[activeWorktreeId] ?? []).find(
        (tab) => tab.title === 'Paseo'
      )
      // Why: only re-target an already-open Paseo tab; opening one runs the
      // same attach in open-paseo-web-tab.ts.
      if (!workspace) {
        return
      }
      let status
      try {
        status = await window.api.paseo.start()
      } catch {
        return
      }
      if (cancelled || status.state !== 'running' || !status.url) {
        return
      }
      const attach = await window.api.paseo.attachProject(path).catch(() => null)
      console.info(`[paseo] follow worktree=${path} attach=${JSON.stringify(attach)}`)
      if (cancelled || !attach?.workspaceId || !attach.serverId) {
        return
      }
      const url = `http://127.0.0.1:${status.port}/h/${encodeURIComponent(attach.serverId)}/workspace/${encodeURIComponent(attach.workspaceId)}`
      const pageId = workspace.activePageId ?? workspace.pageIds?.[0]
      if (pageId) {
        // Why: pin the app's persisted selection so it hydrates onto this
        // workspace after the navigation instead of a stale last-loaded one.
        queuePaseoCwd(pageId, path)
        queuePaseoWorkspaceSelection(pageId, attach.serverId, attach.workspaceId)
        useAppStore.getState().setBrowserPageUrl(pageId, url)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeWorktreeId, activeWorktree?.path, paseoTabExists])
}
