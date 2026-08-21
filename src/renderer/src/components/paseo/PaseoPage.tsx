/**
 * In-app Paseo view: embeds the Paseo web UI (chat) in the main content area.
 * Starts the daemon on first mount and auto-attaches the active worktree so
 * Paseo chat always works in the project the user is looking at.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, FolderTree, LoaderCircle, RefreshCw } from 'lucide-react'
import { useActiveWorktree, useActiveWorktreeId } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  hidePaseoOtherWorkspaces,
  isPaseoWebviewRootUrl,
  isPaseoWebviewUrl,
  preparePaseoWebview,
  queuePaseoCwd,
  queuePaseoWorkspaceSelection
} from '@/components/browser-pane/paseo-webview-style'
import {
  injectPaseoMatchOverlay,
  listenForPaseoForceRecover,
  pollPaseoDirectorySync,
  reconcilePaseoServerId,
  retryPaseoAttach
} from '@/components/browser-pane/paseo-webview-match'
import type { PaseoProjectStatus } from '../../../../shared/paseo-types'

type PaseoDaemonState = 'stopped' | 'starting' | 'running' | 'errored'

// Why: this webview has no store page id; a fixed key addresses its pending selection.
const PASEO_PAGE_ID = 'paseo-page-view'

export default function PaseoPage(): React.JSX.Element {
  const [state, setState] = useState<PaseoDaemonState>('stopped')
  const [error, setError] = useState<string | null>(null)
  const [daemonUrl, setDaemonUrl] = useState<string>('')
  const [port, setPort] = useState<number | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [projects, setProjects] = useState<PaseoProjectStatus[]>([])
  const [tableExpanded, setTableExpanded] = useState(true)
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = useActiveWorktreeId()
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  // Why: re-apply injected UI after the pin+reload settles; the dom-ready pass
  // can run on a page the reload is tearing down, so late passes on the
  // settled document make the overlay stick.
  const reinjectTimersRef = useRef<number[]>([])
  // Why: the directory poll runs once per follow pass; the effect re-runs on
  // every state/daemonUrl change, so the guard keeps a single poll in flight.
  const pollInFlightRef = useRef(false)

  const startDaemon = useCallback(async (): Promise<void> => {
    setState('starting')
    setError(null)
    try {
      const status = await window.api.paseo.start()
      setPort(status.port)
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

  const refreshProjects = useCallback((): void => {
    // Why: attach (allocate) a workspace for every Orca project up front and
    // list them, mirroring the OpenChamber per-project overview.
    void window.api.paseo.listProjects().then((list) => {
      setProjects(list)
    })
  }, [])

  // Why: allocate + list once the daemon is up, then keep workspace states live.
  useEffect(() => {
    if (state !== 'running') {
      return
    }
    refreshProjects()
  }, [state, retryKey, refreshProjects])
  useEffect(() => {
    const timer = window.setInterval(refreshProjects, 15_000)
    return () => window.clearInterval(timer)
  }, [refreshProjects])

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
      const attach = await retryPaseoAttach(worktreePath, () => cancelled)
      console.info(`[paseo] page attach worktree=${worktreePath} attach=${JSON.stringify(attach)}`)
      if (cancelled) {
        return
      }
      if (attach.workspaceId && attach.serverId) {
        // Why: clear the webview partition when the daemon identity changed
        // (stale SPA host registry otherwise rejects the connection); the key
        // change below then loads the app onto a clean bootstrap.
        await reconcilePaseoServerId(attach.serverId)
        if (cancelled) {
          return
        }
        // Why: pin the persisted selection too, so hydration lands on this
        // workspace rather than a stale last-loaded one.
        queuePaseoCwd(PASEO_PAGE_ID, worktreePath)
        queuePaseoWorkspaceSelection(PASEO_PAGE_ID, attach.serverId, attach.workspaceId)
        const port = new URL(daemonUrl).port
        setDaemonUrl(
          `http://127.0.0.1:${port}/h/${encodeURIComponent(attach.serverId)}/workspace/${encodeURIComponent(attach.workspaceId)}`
        )
        // Why: re-inject the overlay and heal a drifted daemon/workspace after
        // the attach settles; the webview may still be reloading (key change),
        // so the poll re-runs on the next effect pass via daemonUrl.
        if (!pollInFlightRef.current && webviewRef.current && activeWorktreeId) {
          pollInFlightRef.current = true
          void pollPaseoDirectorySync(webviewRef.current, activeWorktreeId, worktreePath).finally(
            () => {
              pollInFlightRef.current = false
            }
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activeWorktree?.path, activeWorktreeId, state, daemonUrl])

  const handleWebviewRef = useCallback(
    (node: Electron.WebviewTag | null) => {
      webviewRef.current = node
      if (!node) {
        reinjectTimersRef.current.forEach((timer) => window.clearTimeout(timer))
        reinjectTimersRef.current = []
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
      // so the workspace route for Orca's active worktree wins, then keep the
      // match overlay + force-recover listener attached to that worktree.
      const inject = (): void => {
        const path = activeWorktree?.path
        if (!path) {
          return
        }
        preparePaseoWebview(node, PASEO_PAGE_ID, node.getURL())
        // Why: keep only the current workspace + its session list in the sidebar.
        hidePaseoOtherWorkspaces(node, node.getURL(), path)
        // Why: the SPA home (/open-project) is not under /h/, but a failed
        // attach lands there — keep the pill + force-recover live so the view
        // heals instead of sitting dead.
        if (isPaseoWebviewUrl(node.getURL()) || isPaseoWebviewRootUrl(node.getURL())) {
          injectPaseoMatchOverlay(node, node.getURL(), path)
          listenForPaseoForceRecover(node, path)
        }
      }
      node.addEventListener('dom-ready', () => {
        inject()
        // Why: the pin reload can land between dom-ready and these calls; the
        // idempotent guards in the guest make late re-application harmless.
        ;[800, 2_500].forEach((delay) => {
          const timer = window.setTimeout(inject, delay)
          reinjectTimersRef.current.push(timer)
        })
      })
      node.addEventListener('did-start-loading', () => {
        reinjectTimersRef.current.forEach((timer) => window.clearTimeout(timer))
        reinjectTimersRef.current = []
      })
    },
    [activeWorktree?.path]
  )

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
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-1.5">
        <FolderTree className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold">
          {translate('paseo.view.projects', 'Projects / workspaces')}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {projects.length} project{projects.length === 1 ? '' : 's'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-5 w-5"
          onClick={refreshProjects}
          title={translate('paseo.view.refresh', 'Refresh')}
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
              ? translate('paseo.view.collapse', 'Collapse table')
              : translate('paseo.view.expand', 'Expand table')
          }
        >
          {tableExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 border-b border-border/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        <span>{translate('paseo.view.project', 'Project')}</span>
        <span>{translate('paseo.view.port', 'Port')}</span>
        <span>{translate('paseo.view.workspace', 'Workspace')}</span>
        <span className="text-right">{translate('paseo.view.attached', 'Attached')}</span>
      </div>
      <div
        className={`flex-col overflow-y-auto border-b border-border/60 ${
          tableExpanded ? 'min-h-0 flex-1' : 'max-h-32'
        }`}
      >
        {projects.length === 0 ? (
          <span className="block px-4 py-2 text-[11px] text-muted-foreground">
            {translate('paseo.view.no-projects', 'No projects yet')}
          </span>
        ) : (
          projects.map((project) => {
            const isActive = project.projectPath === activeWorktree?.path
            return (
              <div
                key={project.projectPath}
                className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 border-b border-border/30 px-4 py-1 text-[11px] last:border-b-0 ${
                  isActive ? 'bg-muted/40' : 'hover:bg-muted/30'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {isActive ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-status-success" />
                  ) : null}
                  <span className="truncate font-mono">{project.projectPath}</span>
                </span>
                <span className="font-mono text-muted-foreground">:{port ?? '?'}</span>
                <span className="max-w-[160px] truncate font-mono text-muted-foreground">
                  {project.workspaceId ? project.workspaceId.slice(0, 12) : '—'}
                </span>
                <span className="text-right">
                  <span
                    className={`rounded-full px-1.5 py-px text-[10px] ${
                      project.attached
                        ? 'bg-status-success/10 text-status-success'
                        : 'bg-muted/40 text-muted-foreground/70'
                    }`}
                  >
                    {project.attached
                      ? translate('paseo.view.attached-yes', 'attached')
                      : translate('paseo.view.attached-no', 'pending')}
                  </span>
                </span>
              </div>
            )
          })
        )}
      </div>
      <div className={tableExpanded ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
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
