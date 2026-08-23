/**
 * In-app DeepSeek Harness view: embeds the Harness web UI (dsh --profile web)
 * in the main content area. Starts the web host on first mount with the active
 * worktree as its workspace, and restarts it whenever the active worktree
 * changes so the project list always mirrors what the user is browsing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Layers, LoaderCircle, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store'
import { useActiveWorktree, useActiveWorktreeId } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { ORCA_BROWSER_PARTITION } from '../../../../shared/constants'
import { DEEPSEEK_WEBVIEW_CSS } from '@/lib/deepseek-webview-css'
import {
  alertDeepSeekCwdMismatch,
  hideDeepSeekOtherWorkspaces,
  injectDeepSeekMatchOverlay,
  listenForDeepSeekForceRecover,
  prepareDeepSeekWebview,
  queueDeepSeekSession
} from '@/components/browser-pane/deepseek-webview-style'
import type {
  DeepSeekAgentPreset,
  DeepSeekSessionSummary,
  DeepSeekWebStatus
} from '../../../../shared/deepseek-web-types'
import { DeepSeekProjectsTable } from './DeepSeekProjectsTable'

// Why: this webview has no store page id; a fixed key addresses its pending session.
const DEEPSEEK_PAGE_ID = 'deepseek-page-view'

export default function DeepSeekPage(): React.JSX.Element {
  const [state, setState] = useState<DeepSeekWebStatus['state']>('stopped')
  const [error, setError] = useState<string | null>(null)
  const [webUrl, setWebUrl] = useState<string>('')
  const [port, setPort] = useState<number | null>(null)
  const [presets, setPresets] = useState<DeepSeekAgentPreset[]>([])
  const [sessions, setSessions] = useState<DeepSeekSessionSummary[]>([])
  const [retryKey, setRetryKey] = useState(0)
  const [tableExpanded, setTableExpanded] = useState(true)
  const activeWorktree = useActiveWorktree()
  const activeWorktreeId = useActiveWorktreeId()
  const webviewRef = useRef<Electron.WebviewTag | null>(null)

  const startHost = useCallback(async (cwd: string | null): Promise<void> => {
    setState('starting')
    setError(null)
    try {
      const status = await window.api.deepseekWeb.start(cwd)
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

  // Why: track the worktree whose host this view has acquired so we can release
  // it on unmount; DeepSeek is a singleton, so switching worktrees re-pins the
  // same host instead of spawning a second one (reference-counted in main).
  const acquiredPathRef = useRef<string | null>(null)
  useEffect(() => {
    const worktreePath = activeWorktree?.path ?? null
    if (worktreePath) {
      acquiredPathRef.current = worktreePath
      void startHost(worktreePath)
    }
    return () => {
      acquiredPathRef.current = null
      void window.api.deepseekWeb.release(worktreePath)
    }
  }, [activeWorktree?.path, activeWorktreeId, retryKey, startHost])

  const handleWebviewRef = useCallback((node: Electron.WebviewTag | null) => {
    webviewRef.current = node
    if (!node) {
      return
    }
    // Why: use the default browser partition (persist:orca-browser) so the
    // guest attaches — will-attach-webview is fail-closed and only allows
    // registry partitions.
    node.setAttribute('partition', ORCA_BROWSER_PARTITION)
    node.setAttribute('allowpopups', '')
    node.style.flex = '1'
    node.style.width = '100%'
    node.style.height = '100%'
    node.style.border = 'none'
    node.style.display = 'flex'
    // Why: hide the workspace picker/group headers in the harness UI so
    // switching workspaces can't happen by accident; SPA reloads re-inject.
    const injectCss = (): void => {
      void node.insertCSS(DEEPSEEK_WEBVIEW_CSS)
    }
    node.addEventListener('dom-ready', () => {
      prepareDeepSeekWebview(node, DEEPSEEK_PAGE_ID, node.getURL())
      injectCss()
      // Why: surface the match pill + blocker (and auto force-recover) in the
      // Harness chat UI itself, mirroring the OpenChamber pattern — the SPA
      // must not accept typing into the wrong project when the session
      // resolves to a different cwd than the active worktree.
      const path = useAppStore
        .getState()
        .getKnownWorktreeById(useAppStore.getState().activeWorktreeId ?? '')?.path
      if (path) {
        hideDeepSeekOtherWorkspaces(node, node.getURL(), path)
        injectDeepSeekMatchOverlay(node, node.getURL(), path)
        listenForDeepSeekForceRecover(node, path)
      }
      // Why: after the SPA hydrates, surface a banner + force-sync button if
      // the pinned session is still on a different cwd than the active worktree
      // (the pin+reload can fail silently).
      const worktreeId = useAppStore.getState().activeWorktreeId
      if (path && worktreeId) {
        window.setTimeout(() => {
          alertDeepSeekCwdMismatch(node, DEEPSEEK_PAGE_ID, path, worktreeId)
        }, 1_200)
      }
    })
    node.addEventListener('did-navigate', injectCss)
  }, [])

  const handleRetry = useCallback(() => {
    setRetryKey((value) => value + 1)
  }, [])

  const handleAgentPresetChange = useCallback(
    async (id: string): Promise<void> => {
      const current = presets.find((preset) => preset.isDefault)?.id
      if (id === current) {
        return
      }
      setState('starting')
      setError(null)
      try {
        const status = await window.api.deepseekWeb.setDefaultAgentPreset(id)
        setState(status.state)
        setError(status.error)
        if (status.url) {
          setWebUrl(status.url)
        }
      } catch (err) {
        setState('errored')
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [presets]
  )

  // Why: refresh the agent list whenever the host (re)starts; the current
  // default flag only changes once the restarted host re-reads its settings.
  useEffect(() => {
    if (state !== 'running') {
      return
    }
    let cancelled = false
    void window.api.deepseekWeb.listAgentPresets().then((list) => {
      if (!cancelled) {
        setPresets(list)
      }
    })
    return () => {
      cancelled = true
    }
  }, [state, webUrl])

  const refreshSessions = useCallback((): void => {
    void window.api.deepseekWeb.listSessions().then((list) => {
      setSessions(list)
    })
  }, [])

  // Why: keep the session list in sync with the host; the web UI also
  // reconnects on (re)start, so re-fetch whenever the URL changes.
  useEffect(() => {
    if (state !== 'running') {
      return
    }
    let cancelled = false
    void window.api.deepseekWeb.listSessions().then((list) => {
      if (!cancelled) {
        setSessions(list)
      }
    })
    return () => {
      cancelled = true
    }
  }, [state, webUrl])

  // Why: pin the Harness UI to the session whose cwd matches the active
  // worktree (same shape as Paseo) so switching projects opens the right chat.
  useEffect(() => {
    if (state !== 'running') {
      return
    }
    const cwd = activeWorktree?.path ?? null
    if (!cwd) {
      return
    }
    let cancelled = false
    void window.api.deepseekWeb.listSessions().then((list) => {
      if (cancelled) {
        return
      }
      const match = list.find((session) => session.cwd === cwd)
      if (match) {
        queueDeepSeekSession(DEEPSEEK_PAGE_ID, match.sessionId)
        // Why: the webview may already be dom-ready (its own dom-ready pin
        // ran before the async session list resolved), so re-apply the pin now
        // by reloading — otherwise the SPA boots on the stale session.
        const node = webviewRef.current
        if (node) {
          try {
            node.reload()
          } catch {
            // Why: reload before dom-ready is transient; the next dom-ready
            // pin pass re-attempts.
          }
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [state, webUrl, activeWorktree?.path, activeWorktreeId])

  const loading = state === 'starting' || state === 'stopped'
  const noWorktree = !activeWorktree?.path

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2">
        <span className="text-sm font-semibold">
          {translate('deepseek.view.title', 'DeepSeek Harness')}
        </span>
        {state === 'running' ? (
          <span className="rounded-full bg-status-success/10 px-2 py-0.5 text-[11px] text-status-success">
            {translate('deepseek.view.running', 'Web host running')}
          </span>
        ) : loading ? (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <LoaderCircle className="size-3 animate-spin" />
            {translate('deepseek.view.starting', 'Starting web host…')}
          </span>
        ) : (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">
            {translate('deepseek.view.errored', 'Failed to start')}
          </span>
        )}
        {state === 'running' && presets.length > 0 ? (
          <Select
            value={presets.find((preset) => preset.isDefault)?.id}
            onValueChange={(id) => void handleAgentPresetChange(id)}
          >
            <SelectTrigger size="sm" className="h-7 gap-1 px-2 text-[11px]">
              <SelectValue placeholder={translate('deepseek.view.agent', 'Agent')} />
            </SelectTrigger>
            <SelectContent>
              {presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id} title={preset.description}>
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
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
                  <span>{translate('deepseek.view.sessions', 'Sessions')}</span>
                  <span className="truncate font-normal text-[10px] text-muted-foreground/70">
                    {webUrl}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-5 w-5"
                    onClick={refreshSessions}
                    title={translate('deepseek.view.refresh', 'Refresh')}
                  >
                    <RefreshCw className="size-3" />
                  </Button>
                </div>
                <div className="flex max-h-64 flex-col gap-1 overflow-y-auto p-2">
                  {sessions.length === 0 ? (
                    <span className="px-2 py-1 text-[11px] text-muted-foreground">
                      {translate('deepseek.view.no-sessions', 'No sessions yet')}
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
                        {session.running ? (
                          <span className="shrink-0 rounded-full bg-status-success/10 px-1.5 py-px text-[10px] text-status-success">
                            {translate('deepseek.view.running', 'running')}
                          </span>
                        ) : null}
                        {session.blank ? (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                            {translate('deepseek.view.blank', 'blank')}
                          </span>
                        ) : null}
                        {session.agentPreset ? (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                            {session.agentPreset}
                          </span>
                        ) : null}
                        <span className="truncate">{session.title ?? session.cwd}</span>
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
      <DeepSeekProjectsTable
        activeWorktreePath={activeWorktree?.path ?? null}
        tableExpanded={tableExpanded}
        onToggleExpanded={() => setTableExpanded((expanded) => !expanded)}
      />
      <div className={`${tableExpanded ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}`}>
        {noWorktree ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground">
            <p>
              {translate(
                'deepseek.view.no-worktree',
                'Open a project first to start DeepSeek Harness there.'
              )}
            </p>
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {translate('deepseek.view.starting', 'Starting web host…')}
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-xs text-destructive">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              {translate('deepseek.view.retry', 'Retry')}
            </Button>
          </div>
        ) : webUrl ? (
          <webview
            key={`${webUrl}|${activeWorktreeId}`}
            ref={handleWebviewRef}
            src={webUrl}
            style={{ flex: 1, width: '100%', height: '100%', border: 'none', display: 'flex' }}
          />
        ) : null}
      </div>
    </div>
  )
}
