import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { webviewRegistry } from '@/components/browser-pane/webview-registry'
import {
  alertDeepSeekCwdMismatch,
  queueDeepSeekSession
} from '@/components/browser-pane/deepseek-webview-style'
import { isWebViewAgentTab } from '@/components/sidebar/worktree-available-webview-agent-rows'

/**
 * Ensure the DeepSeek Harness web host is running for the given worktree,
 * then open its UI in a browser tab. If a DeepSeek tab already exists for
 * the worktree, focus it instead of spawning a duplicate.
 */
export async function openDeepSeekHarnessTab(worktreeId: string, groupId: string): Promise<void> {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(worktreeId)
  if (!worktree?.path) {
    toast.error(
      translate(
        'deepseek.view.no-worktree',
        'Open a project first to start DeepSeek Harness there.'
      )
    )
    return
  }
  const existing = (state.browserTabsByWorktree[worktreeId] ?? []).find((tab) =>
    isWebViewAgentTab('deepseek-harness', tab)
  )
  // Why: capture the host's cwd BEFORE start — start() sets cwd to the target
  // path, so comparing status.cwd afterwards can never detect a re-pin.
  const previousCwd = await window.api.deepseekWeb.getStatus().catch(() => ({ cwd: null }))
  const hostCwdChanged = previousCwd.cwd !== worktree.path
  let status
  try {
    // Why: always re-point the host at the target worktree — start() is a no-op
    // when the cwd matches and restarts otherwise, so a re-focused tab still
    // creates new sessions in the current project (an early-return used to
    // leave the host pinned to the previous worktree).
    status = await window.api.deepseekWeb.start(worktree.path)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
    return
  }
  if (existing) {
    // Why: if start() had to re-pin the host to a new cwd, the SPA in the
    // already-open tab still shows the previous project; reload it so the
    // dom-ready handler queues the matching session and hydrates correctly.
    const pageId = existing.activePageId ?? existing.pageIds?.[0]
    if (hostCwdChanged && pageId) {
      state.reloadBrowserPage(pageId)
    }
    state.setActiveBrowserTab(existing.id)
    // Why: reload can silently fail; surface the mismatch banner + force-sync
    // button if the SPA still does not show the expected project.
    if (pageId) {
      const webview = webviewRegistry.get(existing.id)
      if (webview) {
        window.setTimeout(() => {
          alertDeepSeekCwdMismatch(webview, pageId, worktree.path, worktreeId)
        }, 1_500)
      }
    }
    return
  }
  if (status.state !== 'running' || !status.url) {
    toast.error(
      status.error ?? translate('deepseek.view.start-failed', 'DeepSeek Harness failed to start')
    )
    return
  }
  const created = useAppStore.getState().createBrowserTab(worktreeId, status.url, {
    activate: true,
    targetGroupId: groupId,
    title: 'DeepSeek Harness',
    // Why: hide Orca's browser toolbar (URL bar) — the Harness UI is app-like
    // and owns its own chrome; matches Paseo/OpenChamber/Reasonix tabs.
    hideBrowserChrome: true,
    // Why: explicit marker so session detection survives SPA title overwrites
    // and stays unambiguous against other app-like tabs (OpenChamber). Uses the
    // default browser partition so will-attach-webview (fail-closed on
    // non-registry partitions) lets the guest attach.
    webViewAgentType: 'deepseek-harness'
  })
  // Why: pin the Harness UI to the session whose cwd matches this worktree.
  const sessions = await window.api.deepseekWeb.listSessions().catch(() => [])
  const match = sessions.find((session) => session.cwd === worktree.path)
  if (created.activePageId && match) {
    queueDeepSeekSession(created.activePageId, match.sessionId)
  }
}
