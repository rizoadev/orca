import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  queuePaseoCwd,
  queuePaseoWorkspaceSelection
} from '@/components/browser-pane/paseo-webview-style'

/**
 * Ensure the Paseo daemon is running for the given worktree, attach the
 * project (auto-creating its workspace), then open the workspace directly in
 * a browser tab — landing on the chat composer instead of the home screen's
 * "+ New workspace" flow. Falls back to the sessions list when the attach did
 * not yield a workspace id yet.
 */
export async function openPaseoWebTab(worktreeId: string, groupId: string): Promise<void> {
  const state = useAppStore.getState()
  const worktree = state.getKnownWorktreeById(worktreeId)
  if (!worktree?.path) {
    toast.error(translate('paseo.view.no-worktree', 'Open a project first to start Paseo there.'))
    return
  }
  let status
  try {
    status = await window.api.paseo.start()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
    return
  }
  if (status.state !== 'running' || !status.url) {
    toast.error(status.error ?? translate('paseo.view.start-failed', 'Paseo failed to start'))
    return
  }
  const attach = await window.api.paseo.attachProject(worktree.path).catch(() => ({
    ok: false,
    workspaceId: null,
    serverId: null
  }))
  console.info(
    `[paseo] open tab worktree=${worktree.path} attach=${JSON.stringify(attach)} port=${status.port}`
  )
  // Why: the daemon serves its own web app; the workspace route shows the live
  // chat composer for the auto-attached workspace, and the host sessions route
  // lists every open session when no workspace id is known yet.
  const { workspaceId, serverId } = attach
  const port = status.port
  const url =
    workspaceId && serverId
      ? `http://127.0.0.1:${port}/h/${encodeURIComponent(serverId)}/workspace/${encodeURIComponent(workspaceId)}`
      : serverId
        ? `http://127.0.0.1:${port}/h/${encodeURIComponent(serverId)}/sessions`
        : status.url
  const created = useAppStore.getState().createBrowserTab(worktreeId, url, {
    activate: true,
    targetGroupId: groupId,
    title: 'Paseo',
    hideBrowserChrome: true
  })
  // Why: pin the web app's persisted selection so it hydrates onto this
  // workspace (the URL alone can still fall back to a stale last-loaded one).
  if (created.activePageId) {
    queuePaseoCwd(created.activePageId, worktree.path)
  }
  if (workspaceId && serverId && created.activePageId) {
    queuePaseoWorkspaceSelection(created.activePageId, serverId, workspaceId)
  }
}
