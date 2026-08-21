import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  openChamberUrlForDirectory,
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
  // Why: cache-busted URL so the dom-ready handler pins localStorage to this
  // worktree; the query is ignored by the SPA but forces the navigation that
  // re-fires dom-ready with the pin queued.
  const created = useAppStore
    .getState()
    .createBrowserTab(worktreeId, openChamberUrlForDirectory(status.url, worktree.path), {
      activate: true,
      targetGroupId: groupId,
      title: 'OpenChamber',
      hideBrowserChrome: true,
      webViewAgentType: 'openchamber'
    })
  // Why: pin the web app's persisted directory so it hydrates onto this
  // worktree (the server-side attach alone does not re-target the SPA's
  // localStorage-backed directory store).
  if (created.activePageId) {
    queueOpenChamberDirectory(created.activePageId, worktree.path)
  }
}
