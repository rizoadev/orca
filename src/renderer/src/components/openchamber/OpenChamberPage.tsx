/**
 * In-app OpenChamber view: embeds the OpenChamber web UI (coding agent chat)
 * in the main content area. Starts the web server on first mount with the
 * active worktree as its workspace, and re-attaches it whenever the active
 * worktree changes so the session list always mirrors what the user is
 * browsing. Mirrors DeepSeekPage / PaseoPage.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Layers, LoaderCircle, RefreshCw } from 'lucide-react'
import { useActiveWorktree, useActiveWorktreeId } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import type {
  OpenChamberSessionSummary,
  OpenChamberWebStatus
} from '../../../../shared/openchamber-web-types'
import {
  prepareOpenChamberWebview,
  queueOpenChamberDirectory
} from '@/components/browser-pane/openchamber-webview-style'
import { OPENCHAMBER_WEBVIEW_CSS } from '@/lib/openchamber-webview-css'

// Why: this webview has no store page id; a fixed key addresses its pending session.
const OPENCHAMBER_PAGE_ID = 'openchamber-page-view'

export default function OpenChamberPage(): React.JSX.Element {
  const [state, setState] = useState<OpenChamberWebStatus['state']>('stopped')
  const [error, setError] = useState<string | null>(null)
  const [webUrl, setWebUrl] = useState<string>('')
  const [port, setPort] = useState<number | null>(null)
  const [sessions, setSessions] = useState<OpenChamberSessionSummary[]>([])
  const [retryKey, setRetryKey] = useState(0)
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = useActiveWorktreeId()
  const webviewRef = useRef<Electron.WebviewTag | null>(null)

  const startHost = useCallback(async (cwd: string | null): Promise<void> => {
    setState('starting')
    setError(null)
    try {
      const status = await window.api.openchamberWeb.start(cwd)
      setState(status.state)
      setError(status.error)
      if (status.url) {
        setWebUrl(status.url)
      }
      setPort(status.port ?? null)
    } catch (err) {
      setState('errored')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    // Why: spawn (or restart with a new workspace) whenever the active
    // worktree is available or changes; the manager dedupes identical cwd.
    const worktreePath = activeWorktree?.path ?? null
    if (worktreePath) {
      void startHost(worktreePath)
    }
  }, [activeWorktree?.path, activeWorktreeId, retryKey, startHost])

  // Why: keep the server scoped to the active worktree even after startup;
  // the manager already did an initial attach, but a worktree switch while the
  // view is staying mounted re-targets the server.
  useEffect(() => {
    if (state !== 'running') {
      return
    }
    const worktreePath = activeWorktree?.path ?? null
    if (!worktreePath) {
      return
    }
    void window.api.openchamberWeb.attachDirectory(worktreePath)
    // Why: re-pin the SPA's localStorage-backed directory and reload the
    // webview so it hydrates onto this worktree, not a stale last-loaded one.
    // The dom-ready handler writes the pin before the SPA boots.
    queueOpenChamberDirectory(OPENCHAMBER_PAGE_ID, worktreePath)
    webviewRef.current?.reload()
  }, [state, activeWorktree?.path, activeWorktreeId, webUrl])

  const handleWebviewRef = useCallback(
    (node: Electron.WebviewTag | null) => {
      webviewRef.current = node
      if (!node) {
        return
      }
      // Why: shared partition so the web app's local storage / auth persist
      // across page navigations within the embedded view.
      node.setAttribute('partition', 'persist:openchamber-web')
      node.setAttribute('allowpopups', '')
      node.style.flex = '1'
      node.style.width = '100%'
      node.style.height = '100%'
      node.style.border = 'none'
      node.style.display = 'flex'
      // Why: pin the OpenChamber app to the active worktree's directory so the
      // session list targets the project the user is looking at; SPA reloads
      // re-inject.
      const injectDirectory = (): void => {
        const path = activeWorktree?.path
        if (path) {
          queueOpenChamberDirectory(OPENCHAMBER_PAGE_ID, path)
          prepareOpenChamberWebview(node, OPENCHAMBER_PAGE_ID, node.getURL())
          node.insertCSS(OPENCHAMBER_WEBVIEW_CSS).catch(() => undefined)
        }
      }
      node.addEventListener('dom-ready', () => {
        injectDirectory()
      })
    },
    [activeWorktree?.path]
  )

  const handleRetry = useCallback(() => {
    setRetryKey((value) => value + 1)
  }, [])

  const refreshSessions = useCallback((): void => {
    void window.api.openchamberWeb.listSessions().then((list) => {
      setSessions(list)
    })
  }, [])

  // Why: keep the session list in sync with the server; the web app also
  // reconnects on (re)start, so re-fetch whenever the URL changes.
  useEffect(() => {
    if (state !== 'running') {
      return
    }
    let cancelled = false
    void window.api.openchamberWeb.listSessions().then((list) => {
      if (!cancelled) {
        setSessions(list)
      }
    })
    return () => {
      cancelled = true
    }
  }, [state, webUrl])

  const loading = state === 'starting' || state === 'stopped'
  const noWorktree = !activeWorktree?.path

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2">
        <span className="text-sm font-semibold">
          {translate('openchamber.view.title', 'OpenChamber')}
        </span>
        {state === 'running' ? (
          <span className="rounded-full bg-status-success/10 px-2 py-0.5 text-[11px] text-status-success">
            {translate('openchamber.view.running', 'Coding engine running')}
          </span>
        ) : loading ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" />
            {translate('openchamber.view.starting', 'Starting coding engine…')}
          </span>
        ) : (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
            {translate('openchamber.view.errored', 'Failed to start')}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {state === 'running' ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[11px]">
                  <Layers className="size-3.5" />
                  <span className="font-mono text-[10px]">:{port ?? '?'}</span>
                  <span className="rounded-full bg-muted px-1.5 py-px font-mono text-[10px]">
                    {sessions.length}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                  <span>{translate('openchamber.view.sessions', 'Sessions')}</span>
                  <span className="truncate font-normal text-[10px] text-muted-foreground/70">
                    {webUrl}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-5 w-5"
                    onClick={refreshSessions}
                    title={translate('openchamber.view.refresh', 'Refresh')}
                  >
                    <RefreshCw className="size-3" />
                  </Button>
                </div>
                <div className="flex max-h-64 flex-col gap-1 overflow-y-auto p-2">
                  {sessions.length === 0 ? (
                    <span className="px-2 py-1 text-[11px] text-muted-foreground">
                      {translate('openchamber.view.no-sessions', 'No sessions yet')}
                    </span>
                  ) : (
                    sessions.map((session) => (
                      <div
                        key={session.sessionId}
                        className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px] leading-4 hover:bg-muted/50"
                      >
                        <span className="shrink-0 font-mono text-muted-foreground">
                          {session.sessionId.slice(0, 13)}
                        </span>
                        <span className="truncate">{session.title ?? session.directory}</span>
                      </div>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
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
        {noWorktree ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground">
            <p>
              {translate(
                'openchamber.view.no-worktree',
                'Open a project first to start OpenChamber there.'
              )}
            </p>
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {translate('openchamber.view.starting', 'Starting coding engine…')}
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-destructive">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              {translate('openchamber.view.retry', 'Retry')}
            </Button>
          </div>
        ) : webUrl ? (
          <webview
            key={webUrl}
            ref={handleWebviewRef}
            src={webUrl}
            style={{ flex: 1, width: '100%', height: '100%', border: 'none', display: 'flex' }}
          />
        ) : null}
      </div>
    </div>
  )
}
