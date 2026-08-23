/**
 * In-app OpenChamber view: embeds the OpenChamber web UI (coding agent chat)
 * in the main content area. Starts the web server on first mount with the
 * active worktree as its workspace, and re-attaches it whenever the active
 * worktree changes so the session list always mirrors what the user is
 * browsing. Mirrors DeepSeekPage / PaseoPage.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Eraser,
  Layers,
  LoaderCircle,
  Power,
  RefreshCw,
  RotateCcw
} from 'lucide-react'
import { useActiveWorktree, useActiveWorktreeId } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type {
  OpenChamberProjectStatus,
  OpenChamberWebStatus
} from '../../../../shared/openchamber-web-types'
import {
  hideOpenChamberOtherWorkspaces,
  injectOpenChamberMatchOverlay,
  listenForOpenChamberForceRecover,
  pollOpenChamberDirectorySync,
  prepareOpenChamberWebview,
  queueOpenChamberDirectory,
  reloadOpenChamberWebview
} from '@/components/browser-pane/openchamber-webview-style'
import { OPENCHAMBER_WEBVIEW_CSS } from '@/lib/openchamber-webview-css'

// Why: this webview has no store page id; a fixed key addresses its pending session.
const OPENCHAMBER_PAGE_ID = 'openchamber-page-view'

export default function OpenChamberPage(): React.JSX.Element {
  const [state, setState] = useState<OpenChamberWebStatus['state']>('stopped')
  const [error, setError] = useState<string | null>(null)
  const [webUrl, setWebUrl] = useState<string>('')
  const [port, setPort] = useState<number | null>(null)
  const [projects, setProjects] = useState<OpenChamberProjectStatus[]>([])
  const [retryKey, setRetryKey] = useState(0)
  const [tableExpanded, setTableExpanded] = useState(true)
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = useActiveWorktreeId()
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  // Why: Electron's webview.reload() throws before the guest emits dom-ready;
  // the follow effect must defer to the dom-ready pin in that window.
  const webviewReadyRef = useRef(false)
  // Why: re-apply injected UI after the pin+reload settles; the dom-ready pass
  // can run on a page the reload is tearing down, so a couple of late passes
  // on the settled document make the pill/filter stick.
  const reinjectTimersRef = useRef<number[]>([])
  // Why: the directory poll runs 10×1.5s; the follow effect re-runs on every
  // state/webUrl change, so the guard keeps a single poll in flight.
  const pollInFlightRef = useRef(false)

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

  // Why: track the worktree whose server this view has acquired so we can
  // release it on unmount and when switching worktrees — a server only runs
  // while its tab is open, so idle projects stop burning CPU.
  const acquiredPathRef = useRef<string | null>(null)
  useEffect(() => {
    const worktreePath = activeWorktree?.path ?? null
    if (worktreePath) {
      const previous = acquiredPathRef.current
      if (previous && previous !== worktreePath) {
        void window.api.openchamberWeb.release(previous)
      }
      acquiredPathRef.current = worktreePath
      void startHost(worktreePath)
    }
    return () => {
      const path = acquiredPathRef.current
      acquiredPathRef.current = null
      if (path) {
        void window.api.openchamberWeb.release(path)
      }
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
    // The dom-ready handler writes the pin before the SPA boots, and reload()
    // before the guest is ready throws in Electron — deferring to the dom-ready
    // pin on the initial mount covers that window.
    queueOpenChamberDirectory(OPENCHAMBER_PAGE_ID, worktreePath)
    reloadOpenChamberWebview(webviewRef.current, webviewReadyRef.current)
    // Why: the pin+reload can fail silently; keep re-attaching and reloading
    // until the SPA actually shows the expected directory (also re-injects the
    // pill/filter on each pass).
    const webview = webviewRef.current
    if (webview && activeWorktreeId && !pollInFlightRef.current) {
      pollInFlightRef.current = true
      void pollOpenChamberDirectorySync(webview, activeWorktreeId, worktreePath).finally(() => {
        pollInFlightRef.current = false
      })
    }
  }, [state, activeWorktree?.path, activeWorktreeId, webUrl])

  const handleWebviewRef = useCallback(
    (node: Electron.WebviewTag | null) => {
      webviewRef.current = node
      if (!node) {
        reinjectTimersRef.current.forEach((timer) => window.clearTimeout(timer))
        reinjectTimersRef.current = []
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
          // Why: only consume a pin queued by the follow effect on a worktree
          // switch — never re-queue here. Re-queuing on every dom-ready makes
          // prepareOpenChamberWebview reload every time, a loop that destroys
          // the just-injected pill and makes the pin look flaky.
          prepareOpenChamberWebview(node, OPENCHAMBER_PAGE_ID, node.getURL())
          hideOpenChamberOtherWorkspaces(node, node.getURL(), path)
          injectOpenChamberMatchOverlay(node, node.getURL(), path)
          listenForOpenChamberForceRecover(node, path)
          node.insertCSS(OPENCHAMBER_WEBVIEW_CSS).catch(() => undefined)
        }
      }
      node.addEventListener('dom-ready', () => {
        webviewReadyRef.current = true
        injectDirectory()
        // Why: the pin reload can land between dom-ready and these calls; the
        // idempotent guards in the guest make late re-application harmless.
        ;[800, 2_500].forEach((delay) => {
          const timer = window.setTimeout(injectDirectory, delay)
          reinjectTimersRef.current.push(timer)
        })
      })
      node.addEventListener('did-start-loading', () => {
        webviewReadyRef.current = false
        reinjectTimersRef.current.forEach((timer) => window.clearTimeout(timer))
        reinjectTimersRef.current = []
      })
    },
    [activeWorktree?.path]
  )

  const handleRetry = useCallback(() => {
    setRetryKey((value) => value + 1)
  }, [])

  const refreshProjects = useCallback((): void => {
    // Why: per-project overview rows (project, port, status, session count)
    // come from the manager; re-fetch after start/stop/restart cycles.
    void window.api.openchamberWeb.listProjects().then((list) => {
      setProjects(list)
    })
  }, [])

  // Why: keep the overview table in sync with start/restart cycles.
  useEffect(() => {
    refreshProjects()
  }, [state, webUrl, retryKey, refreshProjects])
  // Why: keep session counts / statuses live while the view is open.
  useEffect(() => {
    const timer = window.setInterval(refreshProjects, 15_000)
    return () => window.clearInterval(timer)
  }, [refreshProjects])

  const handleClearStorage = useCallback(
    (projectPath: string): void => {
      void window.api.openchamberWeb.clearStorage(projectPath).then(() => {
        refreshProjects()
        // Why: clearing wipes lastDirectory; re-pin + reload the active webview
        // so the SPA rehydrates onto the worktree right away instead of waiting
        // for the pill's auto-repin (4s) to notice.
        if (projectPath === activeWorktree?.path && webviewReadyRef.current) {
          queueOpenChamberDirectory(OPENCHAMBER_PAGE_ID, projectPath)
          reloadOpenChamberWebview(webviewRef.current, true)
        }
      })
    },
    [activeWorktree?.path, refreshProjects]
  )

  const handleKillProject = useCallback(
    (projectPath: string): void => {
      void window.api.openchamberWeb.stopProject(projectPath).then(refreshProjects)
    },
    [refreshProjects]
  )

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
          {state === 'running' && port ? (
            <span className="font-mono text-[10px] text-muted-foreground">:{port}</span>
          ) : null}
          {activeWorktree ? (
            <span className="max-w-[280px] truncate font-mono text-[11px] text-muted-foreground">
              {activeWorktree.path}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleRetry}
            title={translate('openchamber.view.restart', 'Restart engine')}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-1.5">
        <Layers className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold">
          {translate('openchamber.view.projects', 'Projects / ports')}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {projects.length} server{projects.length === 1 ? '' : 's'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-5 w-5"
          onClick={refreshProjects}
          title={translate('openchamber.view.refresh', 'Refresh')}
        >
          <RefreshCw className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={() => setTableExpanded((expanded) => !expanded)}
          title={
            tableExpanded
              ? translate('openchamber.view.collapse', 'Collapse table')
              : translate('openchamber.view.expand', 'Expand table')
          }
        >
          {tableExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 border-b border-border/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        <span>{translate('openchamber.view.project', 'Project')}</span>
        <span>{translate('openchamber.view.port', 'Port')}</span>
        <span>{translate('openchamber.view.status', 'Status')}</span>
        <span className="text-right">{translate('openchamber.view.sessions', 'Sessions')}</span>
        <span className="text-right">{translate('openchamber.view.actions', 'Actions')}</span>
      </div>
      <div
        className={`flex-col overflow-y-auto border-b border-border/60 ${
          tableExpanded ? 'min-h-0 flex-1' : 'max-h-32'
        }`}
      >
        {projects.length === 0 ? (
          <span className="block px-4 py-2 text-[11px] text-muted-foreground">
            {translate('openchamber.view.no-projects', 'No OpenChamber servers yet')}
          </span>
        ) : (
          projects.map((project) => {
            const isActive = project.projectPath === activeWorktree?.path
            return (
              <div
                key={project.projectPath}
                title={project.error ?? project.projectPath}
                className={`grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-3 border-b border-border/30 px-4 py-1 text-[11px] last:border-b-0 ${
                  isActive ? 'bg-muted/40' : 'hover:bg-muted/30'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {isActive ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-status-success" />
                  ) : null}
                  <span className="truncate font-mono">{project.projectPath}</span>
                </span>
                <span className="font-mono text-muted-foreground">:{project.port}</span>
                <span
                  className={
                    {
                      running: 'text-status-success',
                      starting: 'text-muted-foreground',
                      stopped: 'text-muted-foreground/70',
                      errored: 'text-destructive'
                    }[project.state]
                  }
                >
                  {project.state}
                </span>
                <span className="text-right font-mono text-muted-foreground">
                  {project.sessionCount}
                </span>
                <span className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => handleClearStorage(project.projectPath)}
                    title={translate(
                      'openchamber.view.clear-storage',
                      'Clear storage (localStorage & cookies)'
                    )}
                  >
                    <Eraser className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive/80 hover:text-destructive"
                    onClick={() => handleKillProject(project.projectPath)}
                    title={translate('openchamber.view.kill', 'Kill server')}
                  >
                    <Power className="size-3" />
                  </Button>
                </span>
              </div>
            )
          })
        )}
      </div>
      <div className={tableExpanded ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
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
            key={`${webUrl}|${state}`}
            ref={handleWebviewRef}
            src={webUrl}
            style={{ flex: 1, width: '100%', height: '100%', border: 'none', display: 'flex' }}
          />
        ) : null}
      </div>
    </div>
  )
}
