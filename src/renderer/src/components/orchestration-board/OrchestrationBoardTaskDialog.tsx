import React, { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Check,
  Copy,
  Expand,
  LoaderCircle,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Shrink,
  Users,
  Workflow,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  shortWorktreeLabel,
  taskBoardLabel,
  type OrchestrationBoardComment,
  type OrchestrationBoardInCharge,
  type OrchestrationBoardRosterRow,
  type OrchestrationBoardTask
} from './orchestration-board-model'
import {
  collectOrchestrationTaskRunningAgents,
  summarizeRunningAgents
} from './orchestration-task-running-agents'

export type OrchestrationBoardTaskThread = {
  task: OrchestrationBoardTask
  comments: OrchestrationBoardComment[]
  roster: OrchestrationBoardRosterRow[]
  inCharge: OrchestrationBoardInCharge
}

export type OrchestrationBoardDetailLayout = 'split' | 'full' | 'modal'

type ThreadFilter = 'all' | 'comment' | 'result' | 'dispatch' | 'system'

const STATUS_BADGE: Record<string, string> = {
  ready: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  pending: 'bg-muted text-muted-foreground',
  dispatched: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  failed: 'bg-destructive/15 text-destructive',
  blocked: 'bg-orange-500/15 text-orange-700 dark:text-orange-400'
}

const KIND_BADGE: Record<string, string> = {
  comment: 'bg-muted text-muted-foreground',
  result: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  dispatch: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  system: 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
}

function StatusPill({ status }: { status: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
        STATUS_BADGE[status] ?? 'bg-muted text-muted-foreground'
      )}
    >
      {status}
    </span>
  )
}

function CopyChip({ value, label }: { value: string; label?: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title={translate('auto.components.orchestration.board.copy', 'Copy')}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      <span className="truncate">{label ?? value}</span>
      {copied ? <Check className="size-3 shrink-0" /> : <Copy className="size-3 shrink-0" />}
    </button>
  )
}

export type OrchestrationBoardMentionOption = {
  id: string
  label: string
  insert: string
  kind: 'agent' | 'squad' | 'role'
}

export function OrchestrationBoardTaskDialog({
  task,
  thread,
  threadLoading,
  commentDraft,
  commentSubmitting,
  selectedSquadId,
  squadsEmpty,
  assigning,
  actionBusy,
  repoLabel,
  mentionOptions = [],
  layout = 'split',
  onLayoutChange,
  onClose,
  onCommentDraftChange,
  onPostComment,
  onReply,
  onRefreshThread,
  onAssign,
  onRetry,
  onStop,
  onDelete,
  onOpenStageTask
}: {
  task: OrchestrationBoardTask
  thread: OrchestrationBoardTaskThread | null
  threadLoading: boolean
  commentDraft: string
  commentSubmitting: boolean
  selectedSquadId: string
  squadsEmpty: boolean
  assigning: boolean
  actionBusy: boolean
  repoLabel: string | null
  mentionOptions?: OrchestrationBoardMentionOption[]
  layout?: OrchestrationBoardDetailLayout
  onLayoutChange?: (layout: OrchestrationBoardDetailLayout) => void
  onClose: () => void
  onCommentDraftChange: (value: string) => void
  onPostComment: (parentId?: string | null) => void
  onReply: (comment: OrchestrationBoardComment) => void
  onRefreshThread: () => void
  onAssign: () => void
  onRetry?: () => void
  onStop: () => void
  onDelete: () => void
  onOpenStageTask: (taskId: string) => void
}): React.JSX.Element {
  const [tab, setTab] = useState('thread')
  const [threadFilter, setThreadFilter] = useState<ThreadFilter>('all')
  const [replyTo, setReplyTo] = useState<OrchestrationBoardComment | null>(null)
  const commentRef = React.useRef<HTMLTextAreaElement | null>(null)

  const insertMention = (insert: string): void => {
    const el = commentRef.current
    const token = insert.startsWith('@') ? `${insert} ` : `@${insert} `
    if (!el) {
      onCommentDraftChange(`${commentDraft}${token}`)
      return
    }
    const start = el.selectionStart ?? commentDraft.length
    const end = el.selectionEnd ?? start
    const next = `${commentDraft.slice(0, start)}${token}${commentDraft.slice(end)}`
    onCommentDraftChange(next)
    requestAnimationFrame(() => {
      const pos = start + token.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  useEffect(() => {
    setReplyTo(null)
    setThreadFilter('all')
  }, [task.id])

  const filteredComments = useMemo(() => {
    const comments = thread?.comments ?? []
    if (threadFilter === 'all') {
      return comments
    }
    return comments.filter((c) => c.kind === threadFilter)
  }, [thread?.comments, threadFilter])

  const inChargeHandle = thread?.inCharge.handle ?? task.assignee_handle ?? null
  const inChargeRole = thread?.inCharge.role ?? task.pipeline_role ?? null
  const isModal = layout === 'modal'
  const isFull = layout === 'full'

  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const runtimeAgentOrchestrationByPaneKey = useAppStore(
    (s) => s.runtimeAgentOrchestrationByPaneKey
  )
  const runningAgents = useMemo(
    () =>
      collectOrchestrationTaskRunningAgents({
        taskId: task.id,
        pipelineId: task.pipeline_id,
        assigneeHandles: [task.assignee_handle, thread?.inCharge?.handle],
        roster: thread?.roster,
        inCharge: thread?.inCharge,
        agentStatusByPaneKey,
        runtimeAgentOrchestrationByPaneKey
      }),
    [
      agentStatusByPaneKey,
      runtimeAgentOrchestrationByPaneKey,
      task.assignee_handle,
      task.id,
      task.pipeline_id,
      thread?.inCharge,
      thread?.roster
    ]
  )
  const runningSummary = useMemo(() => summarizeRunningAgents(runningAgents), [runningAgents])

  const shell = (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden bg-card',
        isModal
          ? 'h-[min(920px,calc(100vh-1rem))] w-full max-h-[calc(100vh-1rem)] rounded-xl border border-border shadow-2xl sm:h-[min(860px,90vh)] sm:max-w-[min(1120px,calc(100vw-2rem))]'
          : 'h-full w-full border-l border-border/60'
      )}
      onClick={isModal ? (event) => event.stopPropagation() : undefined}
    >
      <header className="flex shrink-0 items-start gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold tracking-tight sm:text-[17px]">
              {taskBoardLabel(task)}
            </h2>
            <StatusPill status={task.status} />
            {task.pipeline_role ? (
              <Badge variant="outline" className="font-normal capitalize">
                {task.pipeline_role}
              </Badge>
            ) : null}
            {task.pipeline_stage ? (
              <Badge variant="secondary" className="font-normal capitalize">
                {task.pipeline_stage}
                {task.pipeline_attempt && task.pipeline_attempt > 1
                  ? ` #${task.pipeline_attempt}`
                  : ''}
              </Badge>
            ) : null}
            {runningSummary.total > 0 ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  runningSummary.workingCount > 0
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                )}
                title={runningAgents
                  .map(
                    (a) =>
                      `${a.agentType}${a.model ? ` (${a.model})` : ''} · ${a.state}${a.toolName ? ` · ${a.toolName}` : ''}`
                  )
                  .join('\n')}
              >
                <span className="relative flex size-2">
                  {runningSummary.workingCount > 0 ? (
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  ) : null}
                  <span
                    className={cn(
                      'relative inline-flex size-2 rounded-full',
                      runningSummary.workingCount > 0 ? 'bg-emerald-500' : 'bg-amber-500'
                    )}
                  />
                </span>
                <Bot className="size-3" />
                {runningSummary.workingCount > 0
                  ? translate(
                      'auto.components.orchestration.board.agentsWorking',
                      '{n} working',
                      { n: runningSummary.workingCount }
                    )
                  : translate(
                      'auto.components.orchestration.board.agentsLive',
                      '{n} live',
                      { n: runningSummary.total }
                    )}
                <span className="text-[10px] opacity-80">
                  {runningSummary.agentTypes.slice(0, 3).join(' · ')}
                  {runningSummary.agentTypes.length > 3
                    ? ` +${runningSummary.agentTypes.length - 3}`
                    : ''}
                </span>
              </span>
            ) : task.status === 'dispatched' ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                <Bot className="size-3" />
                {translate(
                  'auto.components.orchestration.board.agentsIdle',
                  'No live agent signal'
                )}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <CopyChip value={task.id} />
            {inChargeHandle ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="size-3" />
                <span className="font-mono text-foreground/80">{inChargeHandle}</span>
                {inChargeRole ? <span>· {inChargeRole}</span> : null}
                {thread?.inCharge.status ? <StatusPill status={thread.inCharge.status} /> : null}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {translate('auto.components.orchestration.board.noAssignee', 'No agent in charge')}
              </span>
            )}
          </div>
          {runningAgents.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {runningAgents.map((agent) => (
                <span
                  key={agent.paneKey}
                  className={cn(
                    'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]',
                    agent.state === 'working'
                      ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-foreground'
                      : agent.state === 'blocked'
                        ? 'border-amber-500/25 bg-amber-500/[0.07] text-foreground'
                        : 'border-border/60 bg-muted/30 text-muted-foreground'
                  )}
                  title={agent.promptPreview}
                >
                  <span
                    className={cn(
                      'size-1.5 shrink-0 rounded-full',
                      agent.state === 'working'
                        ? 'bg-emerald-500'
                        : agent.state === 'blocked'
                          ? 'bg-amber-500'
                          : 'bg-sky-500'
                    )}
                  />
                  <span className="font-medium capitalize">{agent.agentType}</span>
                  {agent.model ? (
                    <span className="truncate text-muted-foreground">{agent.model}</span>
                  ) : null}
                  <span className="capitalize text-muted-foreground">{agent.state}</span>
                  {agent.toolName ? (
                    <span className="truncate text-muted-foreground">{agent.toolName}</span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onLayoutChange && !isModal ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              title={
                isFull
                  ? translate('auto.components.orchestration.board.splitView', 'Split with board')
                  : translate('auto.components.orchestration.board.fullView', 'Expand main view')
              }
              onClick={() => onLayoutChange(isFull ? 'split' : 'full')}
            >
              {isFull ? <Shrink className="size-4" /> : <Expand className="size-4" />}
            </Button>
          ) : null}
          {onLayoutChange ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              title={
                isModal
                  ? translate('auto.components.orchestration.board.dockMain', 'Dock to main window')
                  : translate('auto.components.orchestration.board.popOut', 'Pop out modal')
              }
              onClick={() => onLayoutChange(isModal ? 'split' : 'modal')}
            >
              {isModal ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            title={translate('auto.components.orchestration.board.refreshThread', 'Refresh')}
            onClick={onRefreshThread}
          >
            {threadLoading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <div
        className={cn(
          'grid min-h-0 flex-1',
          isFull || isModal
            ? 'grid-cols-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]'
            : 'grid-cols-1'
        )}
      >
        <aside
          className={cn(
            'flex min-h-0 flex-col border-b border-border/60',
            (isFull || isModal) && 'lg:border-b-0 lg:border-r'
          )}
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-sleek sm:p-5">
            <section className="space-y-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {translate('auto.components.orchestration.board.overview', 'Overview')}
              </h3>
              <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-2 text-xs">
                <dt className="text-muted-foreground">Priority</dt>
                <dd className="capitalize">{task.priority ?? 'medium'}</dd>
                <dt className="text-muted-foreground">Repo</dt>
                <dd className="truncate font-mono">{repoLabel ?? task.repo_id ?? '—'}</dd>
                <dt className="text-muted-foreground">Worktree</dt>
                <dd className="truncate font-mono" title={task.worktree_id ?? undefined}>
                  {shortWorktreeLabel(task.worktree_id) ?? task.worktree_id ?? '—'}
                </dd>
                <dt className="text-muted-foreground">Host</dt>
                <dd>{task.host_id ?? '—'}</dd>
                <dt className="text-muted-foreground">Dispatch</dt>
                <dd className="min-w-0">
                  {thread?.inCharge.dispatchId || task.dispatch_id ? (
                    <CopyChip
                      value={thread?.inCharge.dispatchId ?? task.dispatch_id ?? ''}
                      label={(thread?.inCharge.dispatchId ?? task.dispatch_id ?? '').slice(0, 14)}
                    />
                  ) : (
                    '—'
                  )}
                </dd>
                {task.pipeline_id ? (
                  <>
                    <dt className="text-muted-foreground">Pipeline</dt>
                    <dd className="min-w-0">
                      <CopyChip value={task.pipeline_id} label={task.pipeline_id.slice(0, 14)} />
                    </dd>
                  </>
                ) : null}
              </dl>
            </section>

            <section className="mt-5 space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {translate('auto.components.orchestration.board.actions', 'Actions')}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {task.status === 'ready' ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 w-auto shrink-0"
                    disabled={!selectedSquadId || assigning || squadsEmpty}
                    onClick={onAssign}
                  >
                    {assigning ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                    {translate(
                      'auto.components.orchestration.board.assign.run',
                      'Assign & run'
                    )}
                  </Button>
                ) : null}
                {onRetry &&
                (task.status === 'failed' ||
                  task.status === 'completed' ||
                  task.status === 'dispatched' ||
                  task.pipeline_stage === 'failed') ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 w-auto shrink-0"
                    disabled={actionBusy || assigning}
                    onClick={onRetry}
                  >
                    {actionBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                    {translate(
                      'auto.components.orchestration.board.retry',
                      task.status === 'dispatched' ? 'Retry / resume' : 'Retry'
                    )}
                  </Button>
                ) : null}
                {task.status !== 'completed' && task.status !== 'failed' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 w-auto shrink-0"
                    disabled={actionBusy}
                    onClick={onStop}
                  >
                    {actionBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                    {translate('auto.components.orchestration.board.stop', 'Stop')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="h-8 w-auto shrink-0"
                  disabled={actionBusy}
                  onClick={onDelete}
                >
                  {translate('auto.components.orchestration.board.delete', 'Delete')}
                </Button>
              </div>
              {task.status === 'ready' && squadsEmpty ? (
                <p className="text-[11px] text-muted-foreground">
                  {translate(
                    'auto.components.orchestration.board.assign.setupHint',
                    'Add a squad in Settings → Orchestration.'
                  )}
                </p>
              ) : null}
            </section>

            {thread && thread.roster.length > 0 ? (
              <section className="mt-5">
                <div className="mb-2 flex items-center gap-1.5">
                  <Workflow className="size-3.5 text-muted-foreground" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {translate('auto.components.orchestration.board.roster', 'Pipeline roster')}
                  </h3>
                </div>
                <div className="flex flex-col gap-1.5">
                  {thread.roster.map((row) => {
                    const active = row.taskId === task.id
                    return (
                      <button
                        key={row.taskId}
                        type="button"
                        onClick={() => onOpenStageTask(row.taskId)}
                        className={cn(
                          'rounded-md border px-2.5 py-2 text-left transition-colors',
                          active
                            ? 'border-ring bg-accent'
                            : 'border-border/50 bg-muted/20 hover:bg-accent/60'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[12px] font-medium capitalize">
                            {row.stage ?? row.role ?? 'stage'}
                          </span>
                          <StatusPill status={row.status} />
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span className="capitalize">{row.role ?? '—'}</span>
                          <span className="truncate font-mono">{row.assignee ?? 'unassigned'}</span>
                        </div>
                        {row.attempt && row.attempt > 1 ? (
                          <div className="mt-0.5 text-[10px] text-muted-foreground">
                            attempt {row.attempt}
                          </div>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-border/60 px-4 pt-2 sm:px-5">
              <TabsList className="h-9 w-full justify-start gap-1 bg-transparent p-0">
                <TabsTrigger value="thread" className="gap-1.5 px-3">
                  <MessageSquare className="size-3.5" />
                  {translate('auto.components.orchestration.board.thread', 'Thread')}
                  {thread ? (
                    <span className="tabular-nums text-muted-foreground">
                      {thread.comments.length}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="spec" className="px-3">
                  Spec
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="thread"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/40 px-4 py-2 sm:px-5">
                {(
                  [
                    ['all', 'All'],
                    ['result', 'Results'],
                    ['comment', 'Comments'],
                    ['dispatch', 'Dispatches'],
                    ['system', 'System']
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setThreadFilter(id)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                      threadFilter === id
                        ? 'bg-foreground text-background'
                        : 'bg-muted/50 text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4 scrollbar-sleek sm:p-5">
                {threadLoading && !thread ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    Loading thread…
                  </div>
                ) : null}
                {thread && filteredComments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                    <MessageSquare className="size-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      {translate(
                        'auto.components.orchestration.board.threadEmpty',
                        'No comments yet. Dispatch results post here automatically.'
                      )}
                    </p>
                  </div>
                ) : null}
                {filteredComments.map((comment) => (
                  <article
                    key={comment.id}
                    className={cn(
                      'rounded-lg border border-border/50 bg-card px-3 py-2.5 shadow-sm',
                      comment.kind === 'result' && 'border-emerald-500/20 bg-emerald-500/[0.04]',
                      comment.kind === 'dispatch' && 'border-sky-500/20 bg-sky-500/[0.04]',
                      comment.kind === 'system' && 'border-amber-500/20 bg-amber-500/[0.04]'
                    )}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          KIND_BADGE[comment.kind] ?? KIND_BADGE.comment
                        )}
                      >
                        {comment.kind}
                      </span>
                      <span className="font-mono text-[11px] font-medium">{comment.author}</span>
                      {comment.role ? (
                        <span className="text-[11px] capitalize text-muted-foreground">
                          {comment.role}
                        </span>
                      ) : null}
                      <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                        {comment.created_at?.replace('T', ' ').slice(0, 19)}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                      {comment.body}
                    </div>
                    {comment.kind === 'comment' || comment.kind === 'result' ? (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() => {
                            setReplyTo(comment)
                            setTab('thread')
                            onReply(comment)
                          }}
                        >
                          {translate('auto.components.orchestration.board.reply', 'Reply')}
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>

              <div className="shrink-0 border-t border-border/60 bg-card/95 p-3 sm:p-4">
                {replyTo ? (
                  <div className="mb-2 flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-[11px]">
                    <span className="text-muted-foreground">
                      {translate('auto.components.orchestration.board.replyingTo', 'Replying to')}
                    </span>
                    <span className="font-mono">{replyTo.author}</span>
                    <button
                      type="button"
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      onClick={() => setReplyTo(null)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : null}
                {mentionOptions.length > 0 ? (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {translate('auto.components.orchestration.board.mention', 'Mention')}
                    </span>
                    {mentionOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => insertMention(option.insert)}
                        className={cn(
                          'rounded-full border border-border/60 px-2 py-0.5 text-[11px] transition-colors',
                          'hover:bg-accent hover:text-foreground',
                          option.kind === 'squad' && 'border-sky-500/30 text-sky-700 dark:text-sky-400',
                          option.kind === 'role' &&
                            'border-violet-500/30 text-violet-700 dark:text-violet-400',
                          option.kind === 'agent' && 'font-mono'
                        )}
                        title={option.insert}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <textarea
                    ref={commentRef}
                    value={commentDraft}
                    onChange={(event) => onCommentDraftChange(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                        event.preventDefault()
                        onPostComment(replyTo?.id ?? null)
                      }
                    }}
                    rows={3}
                    placeholder={translate(
                      'auto.components.orchestration.board.commentPlaceholder',
                      'Comment + @agent / @squad:name — posts re-assign the manager AI (⌘/Ctrl+Enter)'
                    )}
                    className={cn(
                      'min-h-[72px] flex-1 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none',
                      'placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      'dark:bg-input/30'
                    )}
                  />
                  <Button
                    type="button"
                    className="self-end"
                    disabled={commentSubmitting || !commentDraft.trim()}
                    onClick={() => onPostComment(replyTo?.id ?? null)}
                  >
                    {commentSubmitting ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                    {translate('auto.components.orchestration.board.commentPost', 'Post & assign')}
                  </Button>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {translate(
                    'auto.components.orchestration.board.commentNotifyHint',
                    'Posts notify the in-charge agent (or @mentions) and reopen finished tasks.'
                  )}
                </p>
              </div>
            </TabsContent>

            <TabsContent
              value="spec"
              className="mt-0 min-h-0 flex-1 overflow-y-auto p-4 scrollbar-sleek data-[state=inactive]:hidden sm:p-5"
            >
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Spec
              </h3>
              <pre className="whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/25 p-4 text-[13px] leading-relaxed">
                {task.spec}
              </pre>
              {task.result ? (
                <>
                  <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Stored result
                  </h3>
                  <pre className="whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/25 p-4 text-[12px] leading-relaxed text-muted-foreground">
                    {task.result}
                  </pre>
                </>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )

  if (!isModal) {
    return shell
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-2 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose()
        }
      }}
    >
      {shell}
    </div>
  )
}
