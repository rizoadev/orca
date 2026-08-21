import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { queueDeepSeekSession } from '@/components/browser-pane/deepseek-webview-style'
import { isWebViewAgentTab } from '@/components/sidebar/worktree-available-webview-agent-rows'

/**
 * Ensure the DeepSeek Harness web host is running for the given worktree,
 * then open its UI in a browser tab. If a DeepSeek tab already exists for
 * the worktree, focus it instead of spawning a duplicate.
 */
export async function openDeepSeekHarnessTab(worktreeId: string, groupId: string): Promise<void> {
  const state = useAppStore.getState()
  const existing = (state.browserTabsByWorktree[worktreeId] ?? []).find((tab) =>
    isWebViewAgentTab('deepseek-harness', tab)
  )
  if (existing) {
    state.setActiveBrowserTab(existing.id)
    return
  }
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
  let status
  try {
    status = await window.api.deepseekWeb.start(worktree.path)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
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
    hideBrowserChrome: true,
    // Why: explicit marker so session detection survives SPA title overwrites
    // and stays unambiguous against other app-like tabs (OpenChamber).
    webViewAgentType: 'deepseek-harness'
  })
  // Why: pin the Harness UI to the session whose cwd matches this worktree.
  const sessions = await window.api.deepseekWeb.listSessions().catch(() => [])
  const match = sessions.find((session) => session.cwd === worktree.path)
  if (created.activePageId && match) {
    queueDeepSeekSession(created.activePageId, match.sessionId)
  }
}
