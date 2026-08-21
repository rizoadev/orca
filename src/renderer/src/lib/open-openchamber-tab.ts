import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { webviewRegistry } from '@/components/browser-pane/webview-registry'
import {
  pollOpenChamberDirectorySync,
  queueOpenChamberDirectory
} from '@/components/browser-pane/openchamber-webview-style'
import { isWebViewAgentTab } from '@/components/sidebar/worktree-available-webview-agent-rows'

/**
 * Ensure the OpenChamber web server is running for the given worktree, attach
 * the directory, then open its UI in a browser tab. If an OpenChamber tab
 * already exists for the worktree, focus it instead of spawning a duplicate.
 */
export async function openOpenChamberTab(worktreeId: string, groupId: string): Promise<void> {
  const state = useAppStore.getState()
  const existing = (state.browserTabsByWorktree[worktreeId] ?? []).find((tab) =>
    isWebViewAgentTab('openchamber', tab)
  )
  if (existing) {
    state.setActiveBrowserTab(existing.id)
    return
  }
  const worktree = state.getKnownWorktreeById(worktreeId)
  if (!worktree?.path) {
    toast.error(
      translate('openchamber.view.no-worktree', 'Open a project first to start OpenChamber there.')
    )
    return
  }
  let status
  try {
    status = await window.api.openchamberWeb.start(worktree.path)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
    return
  }
  if (status.state !== 'running' || !status.url) {
    toast.error(
      status.error ?? translate('openchamber.view.start-failed', 'OpenChamber failed to start')
    )
    return
  }
  // Why: point the server's OpenCode working directory at this worktree so the
  // web app's session list targets the project the tab was opened from.
  await window.api.openchamberWeb.attachDirectory(worktree.path).catch(() => undefined)
  const created = useAppStore.getState().createBrowserTab(worktreeId, status.url, {
    activate: true,
    targetGroupId: groupId,
    title: 'OpenChamber',
    // Why: hide the embedded browser chrome — the URL is stable/deterministic
    // per project and shown in the OpenChamber screen's Projects/ports table,
    // so the toolbar only eats vertical space.
    hideBrowserChrome: true,
    webViewAgentType: 'openchamber'
  })
  // Why: pin the web app's persisted directory so it hydrates onto this
  // worktree (the server-side attach alone does not re-target the SPA's
  // localStorage-backed directory store).
  if (created.activePageId) {
    queueOpenChamberDirectory(created.activePageId, worktree.path)
  }
  // Why: the initial pin+reload can fail silently in packaged builds; poll
  // until the SPA actually shows the attached directory.
  window.setTimeout(() => {
    const webview = webviewRegistry.get(created.id)
    if (webview) {
      void pollOpenChamberDirectorySync(webview, worktreeId, worktree.path)
    }
  }, 500)
}
