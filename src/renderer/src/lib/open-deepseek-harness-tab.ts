import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

/**
 * New Tab → DeepSeek Harness entry.
 *
 * Routes to the in-app DeepSeek Harness screen (the sidebar view) instead of
 * a browser tab: the browser-pane webview renders the harness SPA blank /
 * loading-forever (browser-pane guest injections conflict with it), while the
 * DeepSeekPage webview path is the one that reliably works. The screen starts
 * the web host for the active worktree on mount.
 */
export function openDeepSeekHarnessTab(_worktreeId: string, _groupId: string): void {
  const state = useAppStore.getState()
  const activeWorktree = state.getKnownWorktreeById(state.activeWorktreeId ?? '')
  if (!activeWorktree?.path) {
    toast.error(
      translate(
        'deepseek.view.no-worktree',
        'Open a project first to start DeepSeek Harness there.'
      )
    )
    return
  }
  state.setActiveView('deepseek-harness')
}
