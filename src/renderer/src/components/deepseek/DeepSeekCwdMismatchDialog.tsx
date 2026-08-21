import { useCallback } from 'react'
import { RotateCw, Link2 } from 'lucide-react'
import { useAppStore } from '@/store'
import { webviewRegistry } from '@/components/browser-pane/webview-registry'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

type DeepSeekCwdMismatchModalData = {
  worktreeId?: string
  pageId?: string
  expectedCwd?: string
  shownCwd?: string
}

export default function DeepSeekCwdMismatchDialog(): React.JSX.Element | null {
  const activeModal = useAppStore((s) => s.activeModal)
  const data = useAppStore((s) => s.modalData) as DeepSeekCwdMismatchModalData
  const closeModal = useAppStore((s) => s.closeModal)
  const worktreeId = typeof data.worktreeId === 'string' ? data.worktreeId : ''
  const pageId = typeof data.pageId === 'string' ? data.pageId : ''
  const expectedCwd = typeof data.expectedCwd === 'string' ? data.expectedCwd : ''
  const shownCwd = typeof data.shownCwd === 'string' ? data.shownCwd : ''

  const forceReload = useCallback(() => {
    const state = useAppStore.getState()
    if (pageId) {
      state.reloadBrowserPage(pageId)
    }
    closeModal()
  }, [pageId, closeModal])

  const forceAttach = useCallback(() => {
    const state = useAppStore.getState()
    const worktree = state.getKnownWorktreeById(worktreeId)
    void (async () => {
      if (worktree?.path) {
        await window.api.deepseekWeb.start(worktree.path).catch(() => undefined)
      }
      if (pageId) {
        // Why: re-pin the current session to the matching cwd before reload
        // so the SPA hydrates onto the correct project once the tab reloads.
        const sessions = await window.api.deepseekWeb.listSessions().catch(() => [])
        const match = sessions.find((session) => session.cwd === worktree?.path)
        if (match) {
          const webview = webviewRegistry.get(
            useAppStore
              .getState()
              .browserTabsByWorktree[worktreeId]?.find(
                (tab) => tab.activePageId === pageId || tab.pageIds?.includes(pageId)
              )?.id ?? ''
          )
          if (webview) {
            await webview
              .executeJavaScript(
                `localStorage.setItem('dsh.sessions.current', ${JSON.stringify(
                  JSON.stringify({ sessionId: match.sessionId })
                )})`
              )
              .catch(() => undefined)
          }
        }
        state.reloadBrowserPage(pageId)
      }
    })()
    closeModal()
  }, [worktreeId, pageId, closeModal])

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeModal()
      }
    },
    [closeModal]
  )

  if (activeModal !== 'deepseek-cwd-mismatch') {
    return null
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate('deepseek.cwdMismatch.title', 'DeepSeek Harness is on the wrong project')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'deepseek.cwdMismatch.body',
              'The Harness UI is showing a different folder than the one you have open. Reload the tab to pick up the current project, or re-attach the session to the active worktree.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1 rounded-md bg-muted/50 px-3 py-2 font-mono text-[11px] text-muted-foreground">
          <span className="truncate">
            {translate('deepseek.cwdMismatch.expected', 'Expected')}: {expectedCwd || '—'}
          </span>
          <span className="truncate">
            {translate('deepseek.cwdMismatch.shown', 'Shown')}: {shownCwd || '—'}
          </span>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={closeModal}>
            {translate('deepseek.cwdMismatch.cancel', 'Cancel')}
          </Button>
          <Button size="sm" onClick={forceReload}>
            <RotateCw className="size-3.5" />
            {translate('deepseek.cwdMismatch.forceReload', 'Force reload')}
          </Button>
          <Button size="sm" onClick={forceAttach}>
            <Link2 className="size-3.5" />
            {translate('deepseek.cwdMismatch.forceAttach', 'Force attach')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
