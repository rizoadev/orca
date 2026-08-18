import React, { useMemo } from 'react'
import {
  Bot,
  Expand,
  ListTree,
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
import { OrchestrationTaskBreadcrumb } from './OrchestrationTaskBreadcrumb'
import {
  orchestrationStatusTone,
  taskBoardLabel,
  type OrchestrationBoardComment,
  type OrchestrationBoardInCharge,
  type OrchestrationBoardRosterRow,
  type OrchestrationBoardTask
} from './orchestration-board-model'
import { OrchestrationTaskOverviewPane } from './OrchestrationTaskOverviewPane'
import { OrchestrationTaskThreadPane } from './OrchestrationTaskThreadPane'
import { OrchestrationTaskSpecPane } from './OrchestrationTaskSpecPane'
import { OrchestrationSubtasksPanel } from './OrchestrationSubtasksPanel'
import {
  collectOrchestrationTaskRunningAgents,
  summarizeRunningAgents
} from './orchestration-task-running-agents'

export type OrchestrationBoardTaskThread = {
  task: OrchestrationBoardTask
  comments: OrchestrationBoardComment[]
  roster: OrchestrationBoardRosterRow[]
  inCharge: OrchestrationBoardInCharge
  autopilot?: boolean
  pipelineId?: string | null
  /** Parent chain from pipeline root to the direct parent (excludes self). */
  ancestors?: OrchestrationBoardTask[]
}

export type OrchestrationBoardDetailLayout = 'split' | 'full' | 'modal' | 'embedded'

export type OrchestrationBoardMentionOption = {
  id: string
  label: string
  insert: string
  kind: 'agent' | 'squad' | 'role'
}

const EMPTY_SUBTASKS: OrchestrationBoardTask[] = []
const EMPTY_MENTIONS: OrchestrationBoardMentionOption[] = []

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
  mentionOptions = EMPTY_MENTIONS,
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
  onOpenStageTask,
  onToggleAutopilot,
  autopilotBusy = false,
  subtasks = EMPTY_SUBTASKS,
  onOpenTask,
  onAddSubtask,
  parentTask,
  onOpenBoard
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
  onToggleAutopilot?: (enabled: boolean) => void
  autopilotBusy?: boolean
  subtasks?: OrchestrationBoardTask[]
  onOpenTask?: (task: OrchestrationBoardTask) => void
  onAddSubtask?: (title: string) => void
  parentTask?: OrchestrationBoardTask | null
  onOpenParent?: () => void
  /** Open this task in the full orchestration board page. */
  onOpenBoard?: () => void
}): React.JSX.Element {
  const isModal = layout === 'modal'
  const isFull = layout === 'full'
  const isEmbedded = layout === 'embedded'

  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const runtimeAgentOrchestrationByPaneKey = useAppStore(
    (s) => s.runtimeAgentOrchestrationByPaneKey
  )
  const runningAgents = useMemo(
    () =>
      collectOrchestrationTaskRunningAgents({
        taskId: task.id,
        pipelineId: task.pipeline_id,
        worktreeId: task.worktree_id,
        allowWorktreeFallback:
          task.status === 'dispatched' || thread?.inCharge?.status === 'dispatched',
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
      task.status,
      task.worktree_id,
      thread?.inCharge,
      thread?.roster
    ]
  )
  const runningSummary = useMemo(() => summarizeRunningAgents(runningAgents), [runningAgents])
  const inChargeHandle = thread?.inCharge.handle ?? task.assignee_handle ?? null
  const inChargeRole = thread?.inCharge.role ?? task.pipeline_role ?? null

  const shell = (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden bg-card',
        isModal
          ? 'h-[min(920px,calc(100vh-1rem))] w-full max-h-[calc(100vh-1rem)] rounded-xl border border-border shadow-2xl sm:h-[min(860px,90vh)] sm:max-w-[min(1120px,calc(100vw-2rem))]'
          : isEmbedded
            ? 'h-full w-full border-0 bg-background'
            : 'h-full w-full border-l border-border/60'
      )}
      onClick={isModal ? (event) => event.stopPropagation() : undefined}
    >
      <header className="flex shrink-0 items-start gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <OrchestrationTaskBreadcrumb
            ancestors={thread?.ancestors}
            task={task}
            parentTask={parentTask}
            onOpenTask={onOpenTask}
          />
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold tracking-tight sm:text-[17px]">
              {taskBoardLabel(task)}
            </h2>
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize',
                orchestrationStatusTone(task.status)
              )}
            >
              {task.status}
            </span>
            {task.pipeline_role ? (
              <Badge variant="outline" className="font-normal capitalize">
                {task.pipeline_role}
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
              >
                <Bot className="size-3" />
                {runningSummary.workingCount > 0
                  ? translate('auto.components.orchestration.board.agentsWorking', '{n} working', {
                      n: runningSummary.workingCount
                    })
                  : translate('auto.components.orchestration.board.agentsLive', '{n} live', {
                      n: runningSummary.total
                    })}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">{task.id}</span>
            {inChargeHandle ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="size-3" />
                <span className="font-mono text-foreground/80">{inChargeHandle}</span>
                {inChargeRole ? <span>· {inChargeRole}</span> : null}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onLayoutChange && !isModal && !isEmbedded ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              title={isFull ? 'Split with board' : 'Expand main view'}
              onClick={() => onLayoutChange(isFull ? 'split' : 'full')}
            >
              {isFull ? <Shrink className="size-4" /> : <Expand className="size-4" />}
            </Button>
          ) : null}
          {onLayoutChange && !isEmbedded ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              title={isModal ? 'Open in main window' : 'Pop out modal'}
              onClick={() => onLayoutChange(isModal ? 'split' : 'modal')}
            >
              {isModal ? (
                <PanelRightClose className="size-4" />
              ) : (
                <PanelRightOpen className="size-4" />
              )}
            </Button>
          ) : null}
          {onOpenBoard ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              title={translate(
                'auto.components.orchestration.board.openBoard',
                'Open in orchestration board'
              )}
              onClick={onOpenBoard}
            >
              <Workflow className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            title="Refresh"
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
          isFull || isModal || isEmbedded
            ? 'grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]'
            : 'grid-cols-1 grid-rows-[minmax(0,1fr)]'
        )}
      >
        <aside
          className={cn(
            'flex min-h-0 flex-col overflow-y-auto',
            (isFull || isModal || isEmbedded) && 'lg:border-b-0 lg:border-r'
          )}
        >
          <OrchestrationTaskOverviewPane
            task={task}
            thread={thread}
            repoLabel={repoLabel}
            runningAgents={runningAgents}
            selectedSquadId={selectedSquadId}
            squadsEmpty={squadsEmpty}
            assigning={assigning}
            actionBusy={actionBusy}
            onAssign={onAssign}
            onRetry={onRetry}
            onStop={onStop}
            onDelete={onDelete}
            onToggleAutopilot={onToggleAutopilot}
            autopilotBusy={autopilotBusy}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <Tabs defaultValue="thread" className="flex min-h-0 flex-1 flex-col">
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
                  {translate('auto.components.orchestration.board.spec', 'Spec')}
                </TabsTrigger>
                <TabsTrigger value="subtasks" className="gap-1.5 px-3">
                  <ListTree className="size-3.5" />
                  {translate('auto.components.orchestration.board.subtasks', 'Subtasks')}
                  {subtasks.length > 0 ? (
                    <span className="tabular-nums text-muted-foreground">{subtasks.length}</span>
                  ) : null}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="thread"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <OrchestrationTaskThreadPane
                comments={thread?.comments ?? []}
                loading={threadLoading}
                commentDraft={commentDraft}
                commentSubmitting={commentSubmitting}
                mentionOptions={mentionOptions}
                onCommentDraftChange={onCommentDraftChange}
                onPostComment={onPostComment}
                onReply={onReply}
              />
            </TabsContent>

            <TabsContent
              value="spec"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              <OrchestrationTaskSpecPane task={task} />
            </TabsContent>

            <TabsContent
              value="subtasks"
              className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              {onOpenTask && onAddSubtask ? (
                <OrchestrationSubtasksPanel
                  tasks={subtasks}
                  rootTask={task}
                  onOpenTask={onOpenTask ?? ((t) => onOpenStageTask(t.id))}
                  onAddSubtask={onAddSubtask}
                />
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
