/**
 * In-app Reasonix view: embeds the Reasonix web UI (coding-agent chat)
 * in the main content area. Starts the web server on first mount with the
 * active worktree as its workspace, and re-attaches it whenever the active
 * worktree changes so the chat always mirrors what the user is browsing.
 * Mirrors OpenChamberPage.
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
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  injectReasonixMatchOverlay,
  listenForReasonixForceRecover
} from '@/components/browser-pane/reasonix-webview-style'
import { ORCA_BROWSER_PARTITION } from '../../../../shared/constants'
import type {
  ReasonixProjectStatus,
  ReasonixWebStatus
} from '../../../../shared/reasonix-web-types'

export default function ReasonixPage(): React.JSX.Element {
  const [state, setState] = useState<ReasonixWebStatus['state']>('stopped')
  const [error, setError] = useState<string | null>(null)
  const [webUrl, setWebUrl] = useState<string>('')
  const [port, setPort] = useState<number | null>(null)
  const [projects, setProjects] = useState<ReasonixProjectStatus[]>([])
  const [retryKey, setRetryKey] = useState(0)
  const [tableExpanded, setTableExpanded] = useState(true)
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = useActiveWorktreeId()
  const webviewRef = useRef<Electron.WebviewTag | null>(null)

  const startHost = useCallback(async (cwd: string | null): Promise<void> => {
    setState('starting')
    setError(null)
    try {
      const status = await window.api.reasonixWeb.start(cwd)
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

  // Why: keep the server scoped to the active worktree even after startup.
  useEffect(() => {
    if (state !== 'running') {
      return
    }
    const worktreePath = activeWorktree?.path ?? null
    if (!worktreePath) {
      return
    }
    void window.api.reasonixWeb.attachDirectory(worktreePath)
  }, [state, activeWorktree?.path, activeWorktreeId, webUrl])

  const handleWebviewRef = useCallback((node: Electron.WebviewTag | null) => {
    webviewRef.current = node
    if (!node) {
      return
    }
    // Why: use the default browser partition (persist:orca-browser) so the
    // guest attaches — will-attach-webview is fail-closed and only allows
    // registry partitions. The SPA's local storage / auth persist here.
    node.setAttribute('partition', ORCA_BROWSER_PARTITION)
    node.setAttribute('allowpopups', '')
    node.style.flex = '1'
    node.style.width = '100%'
    node.style.height = '100%'
    node.style.border = 'none'
    node.style.display = 'flex'
    // Why: surface the match pill + blocker (and auto force-recover) in the
    // Reasonix chat UI too, mirroring DeepSeek/OpenChamber — the SPA must
    // not accept typing into the wrong project when its per-project server
    // is pinned to a different worktree than the active one.
    node.addEventListener('dom-ready', () => {
      const path = useAppStore
        .getState()
        .getKnownWorktreeById(useAppStore.getState().activeWorktreeId ?? '')?.path
      if (path) {
        injectReasonixMatchOverlay(node, node.getURL(), path)
        listenForReasonixForceRecover(node, path)
      }
    })
  }, [])

  const handleRetry = useCallback(() => {
    setRetryKey((value) => value + 1)
  }, [])

  const refreshProjects = useCallback((): void => {
    void window.api.reasonixWeb.listProjects().then((list) => {
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
      void window.api.reasonixWeb.clearStorage(projectPath).then(() => {
        refreshProjects()
      })
    },
    [refreshProjects]
  )

  const handleKillProject = useCallback(
    (projectPath: string): void => {
      void window.api.reasonixWeb.stopProject(projectPath).then(refreshProjects)
    },
    [refreshProjects]
  )

  const loading = state === 'starting' || state === 'stopped'
  const noWorktree = !activeWorktree?.path

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2">
        <span className="text-sm font-semibold">
          {translate('reasonix.view.title', 'Reasonix')}
        </span>
        {state === 'running' ? (
          <span className="rounded-full bg-status-success/10 px-2 py-0.5 text-[11px] text-status-success">
            {translate('reasonix.view.running', 'Coding engine running')}
          </span>
        ) : loading ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" />
            {translate('reasonix.view.starting', 'Starting coding engine…')}
          </span>
        ) : (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
            {translate('reasonix.view.errored', 'Failed to start')}
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
            title={translate('reasonix.view.restart', 'Restart engine')}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-1.5">
        <Layers className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold">
          {translate('reasonix.view.projects', 'Projects / ports')}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {projects.length} server{projects.length === 1 ? '' : 's'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-5 w-5"
          onClick={refreshProjects}
          title={translate('reasonix.view.refresh', 'Refresh')}
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
              ? translate('reasonix.view.collapse', 'Collapse table')
              : translate('reasonix.view.expand', 'Expand table')
          }
        >
          {tableExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 border-b border-border/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        <span>{translate('reasonix.view.project', 'Project')}</span>
        <span>{translate('reasonix.view.port', 'Port')}</span>
        <span>{translate('reasonix.view.status', 'Status')}</span>
        <span className="text-right">{translate('reasonix.view.sessions', 'Sessions')}</span>
        <span className="text-right">{translate('reasonix.view.actions', 'Actions')}</span>
      </div>
      <div
        className={`flex-col overflow-y-auto border-b border-border/60 ${
          tableExpanded ? 'min-h-0 flex-1' : 'max-h-32'
        }`}
      >
        {projects.length === 0 ? (
          <span className="block px-4 py-2 text-[11px] text-muted-foreground">
            {translate('reasonix.view.no-projects', 'No Reasonix servers yet')}
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
                      'reasonix.view.clear-storage',
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
                    title={translate('reasonix.view.kill', 'Kill server')}
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
                'reasonix.view.no-worktree',
                'Open a project first to start Reasonix there.'
              )}
            </p>
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {translate('reasonix.view.starting', 'Starting coding engine…')}
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-destructive">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              {translate('reasonix.view.retry', 'Retry')}
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
