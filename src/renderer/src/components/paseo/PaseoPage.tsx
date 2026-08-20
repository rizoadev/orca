/**
 * In-app Paseo view: embeds the Paseo web UI (chat) in the main content area.
 * Starts the daemon on first mount and auto-attaches the active worktree so
 * Paseo chat always works in the project the user is looking at.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useActiveWorktree, useActiveWorktreeId } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  preparePaseoWebview,
  queuePaseoCwd,
  queuePaseoWorkspaceSelection
} from '@/components/browser-pane/paseo-webview-style'

type PaseoDaemonState = 'stopped' | 'starting' | 'running' | 'errored'

// Why: this webview has no store page id; a fixed key addresses its pending selection.
const PASEO_PAGE_ID = 'paseo-page-view'

export default function PaseoPage(): React.JSX.Element {
  const [state, setState] = useState<PaseoDaemonState>('stopped')
  const [error, setError] = useState<string | null>(null)
  const [daemonUrl, setDaemonUrl] = useState<string>('')
  const [retryKey, setRetryKey] = useState(0)
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = useActiveWorktreeId()
  const webviewRef = useRef<Electron.WebviewTag | null>(null)

  const startDaemon = useCallback(async (): Promise<void> => {
    setState('starting')
    setError(null)
    try {
      const status = await window.api.paseo.start()
      if (status.state === 'running' || status.state === 'errored') {
        setState(status.state)
        setError(status.error)
        if (status.url) {
          setDaemonUrl(status.url)
        }
        return
      }
      // Why: a fresh spawn has to survive the poll window; fall back to the
      // deterministic loopback URL and let the webview retry on load.
      const url = await window.api.paseo.getDaemonUrl()
      setDaemonUrl(url)
      setState('running')
    } catch (err) {
      setState('errored')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void startDaemon()
  }, [startDaemon, retryKey])

  // Why: attach the active worktree whenever it changes and point the webview
  // at that workspace's route — the root URL would let the web app fall back
  // to its last-loaded workspace instead of Orca's active worktree.
  useEffect(() => {
    if (state !== 'running') {
      return
    }
    const worktreePath = activeWorktree?.path ?? null
    if (!worktreePath || !daemonUrl) {
      return
    }
    let cancelled = false
    void (async () => {
      const attach = await window.api.paseo.attachProject(worktreePath).catch(() => null)
      console.info(`[paseo] page attach worktree=${worktreePath} attach=${JSON.stringify(attach)}`)
      if (cancelled) {
        return
      }
      if (attach?.workspaceId && attach.serverId) {
        // Why: pin the persisted selection too, so hydration lands on this
        // workspace rather than a stale last-loaded one.
        queuePaseoCwd(PASEO_PAGE_ID, worktreePath)
        queuePaseoWorkspaceSelection(PASEO_PAGE_ID, attach.serverId, attach.workspaceId)
        const port = new URL(daemonUrl).port
        setDaemonUrl(
          `http://127.0.0.1:${port}/h/${encodeURIComponent(attach.serverId)}/workspace/${encodeURIComponent(attach.workspaceId)}`
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeWorktree?.path, activeWorktreeId, state, daemonUrl])

  const handleWebviewRef = useCallback((node: Electron.WebviewTag | null) => {
    webviewRef.current = node
    if (!node) {
      return
    }
    // Why: the guest navigations (e.g. Paseo internal links) must stay inside
    // the webview; allow popups for auth flows.
    node.setAttribute('partition', 'persist:paseo')
    node.setAttribute('allowpopups', '')
    node.style.flex = '1'
    node.style.width = '100%'
    node.style.height = '100%'
    node.style.border = 'none'
    node.style.display = 'flex'
    // Why: pin/clear the web app's persisted last-workspace selection on load
    // so the workspace route for Orca's active worktree wins.
    node.addEventListener('dom-ready', () => {
      preparePaseoWebview(node, PASEO_PAGE_ID, node.getURL())
    })
  }, [])

  const handleRetry = useCallback(() => {
    setRetryKey((value) => value + 1)
  }, [])

  const loading = state === 'starting' || state === 'stopped'

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2">
        <span className="text-sm font-semibold">{translate('paseo.view.title', 'Paseo')}</span>
        {state === 'running' ? (
          <span className="rounded-full bg-status-success/10 px-2 py-0.5 text-[11px] text-status-success">
            {translate('paseo.view.running', 'Daemon running')}
          </span>
        ) : loading ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" />
            {translate('paseo.view.starting', 'Starting daemon…')}
          </span>
        ) : (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
            {translate('paseo.view.errored', 'Failed to start')}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {activeWorktree ? (
            <span className="max-w-[280px] truncate font-mono text-[11px] text-muted-foreground">
              {activeWorktree.path}
            </span>
          ) : null}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRetry}>
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {translate('paseo.view.starting', 'Starting daemon…')}
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-destructive">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              {translate('paseo.view.retry', 'Retry')}
            </Button>
          </div>
        ) : daemonUrl ? (
          <webview
            key={daemonUrl}
            ref={handleWebviewRef}
            src={daemonUrl}
            style={{ flex: 1, width: '100%', height: '100%', border: 'none', display: 'flex' }}
          />
        ) : null}
      </div>
    </div>
  )
}
