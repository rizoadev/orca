import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { useActiveWorktree, useActiveWorktreeId } from '@/store/selectors'
import { webviewRegistry } from '@/components/browser-pane/webview-registry'
import {
  alertDeepSeekCwdMismatch,
  queueDeepSeekSession
} from '@/components/browser-pane/deepseek-webview-style'

/**
 * Keeps the DeepSeek Harness web host pointed at Orca's active worktree.
 * The host is single-instance with one cwd; switching worktrees restarts it
 * (start() is a no-op on the same cwd) so new sessions target the folder the
 * user is looking at. The already-loaded tab must also be re-targeted: the SPA
 * reads its current-session localStorage on boot, so the follow queues the
 * matching session and reloads the tab (via reloadBrowserPage) so the dom-ready
 * handler writes the pin and the SPA hydrates onto the new worktree.
 */
export function useDeepSeekWorktreeFollow(): void {
  const activeWorktreeId = useActiveWorktreeId()
  const activeWorktree = useActiveWorktree()
  // Why: remember the last worktree we re-targeted so opening a fresh tab
  // (which already queues the session in open-deepseek-harness-tab.ts) does
  // not trigger a redundant reload; only a real worktree switch does.
  const lastTargetedPathRef = useRef<string | null>(null)
  // Why: re-run when the DeepSeek tab appears (restored on launch or opened
  // via New Tab), not only when the worktree changes — a restored tab may
  // still point at an older directory.
  const deepSeekTabExists = useAppStore((state) =>
    (activeWorktreeId ? (state.browserTabsByWorktree[activeWorktreeId] ?? []) : []).some(
      (tab) => tab.webViewAgentType === 'deepseek-harness' || tab.title === 'DeepSeek Harness'
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
        (t) => t.webViewAgentType === 'deepseek-harness' || t.title === 'DeepSeek Harness'
      )
      // Why: only re-target an already-open DeepSeek tab; opening one runs the
      // same start in open-deepseek-harness-tab.ts.
      if (!tab) {
        return
      }
      try {
        const status = await window.api.deepseekWeb.start(path)
        if (cancelled || status.state !== 'running') {
          return
        }
        const sessions = await window.api.deepseekWeb.listSessions().catch(() => [])
        const match = sessions.find((session) => session.cwd === path)
        const pageId = tab.activePageId ?? tab.pageIds?.[0]
        if (pageId && match) {
          queueDeepSeekSession(pageId, match.sessionId)
          // Why: only reload on an actual worktree switch; the initial tab
          // open already queues + reloads via its own dom-ready path.
          if (lastTargetedPathRef.current !== path) {
            lastTargetedPathRef.current = path
            state.reloadBrowserPage(pageId)
          }
        }
        // Why: reload can silently fail (SPA keeps the previous project).
        // Surface a banner + force-sync button when the pinned cwd still does
        // not match, instead of leaving the wrong chat visible.
        const webview = webviewRegistry.get(tab.id)
        if (webview && pageId) {
          window.setTimeout(() => {
            if (!cancelled) {
              alertDeepSeekCwdMismatch(webview, pageId, path, activeWorktreeId)
            }
          }, 1_500)
        }
      } catch {
        // Best-effort — the host may be starting or already pinned.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeWorktreeId, activeWorktree?.path, deepSeekTabExists])
}
