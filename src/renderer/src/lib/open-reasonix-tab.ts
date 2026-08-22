import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import reasonixIconUrl from '../../../../resources/reasonix-icon.svg?url'
import { isWebViewAgentTab } from '@/components/sidebar/worktree-available-webview-agent-rows'

/**
 * Ensure the Reasonix web host is running for the given worktree, then open
 * its chat UI in a browser tab. If a Reasonix tab already exists for the
 * worktree, focus it instead of spawning a duplicate.
 */
export async function openReasonixTab(worktreeId: string, groupId: string): Promise<void> {
  const state = useAppStore.getState()
  const existing = (state.browserTabsByWorktree[worktreeId] ?? []).find((tab) =>
    isWebViewAgentTab('reasonix', tab)
  )
  if (existing) {
    state.setActiveBrowserTab(existing.id)
    return
  }
  const worktree = state.getKnownWorktreeById(worktreeId)
  if (!worktree?.path) {
    toast.error(
      translate('reasonix.view.no-worktree', 'Open a project first to start Reasonix there.')
    )
    return
  }
  let status
  try {
    status = await window.api.reasonixWeb.start(worktree.path)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err))
    return
  }
  if (status.state !== 'running' || !status.url) {
    toast.error(status.error ?? translate('reasonix.view.start-failed', 'Reasonix failed to start'))
    return
  }
  const created = useAppStore.getState().createBrowserTab(worktreeId, status.url, {
    activate: true,
    targetGroupId: groupId,
    title: 'Reasonix',
    // Why: app-like web view (no browser chrome), like the other embedded
    // coding-agent UIs; the marker keeps session detection unambiguous. Uses
    // the default browser partition so will-attach-webview (fail-closed on
    // non-registry partitions) lets the guest attach.
    hideBrowserChrome: true,
    webViewAgentType: 'reasonix'
  })
  // Why: the Reasonix SPA serves no <link rel=icon>, so page-favicon-updated
  // never fires and the tab would fall back to the generic globe glyph; pin the
  // branded Reasonix mark instead so the tab carries its own identity.
  if (created.activePageId) {
    useAppStore.getState().updateBrowserPageState(created.activePageId, {
      faviconUrl: reasonixIconUrl
    })
  }
}
