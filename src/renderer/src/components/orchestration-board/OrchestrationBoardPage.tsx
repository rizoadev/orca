import React, { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { OrchestrationBoardWorkspace } from './OrchestrationBoardWorkspace'
import { OrchestrationBoardHeader } from './OrchestrationBoardHeader'
import { OrchestrationProductGoalDialog } from './OrchestrationProductGoalDialog'
import { OrchestrationBoardDetailPane } from './OrchestrationBoardDetailPane'
import type { OrchestrationBoardDetailLayout } from './OrchestrationBoardTaskDialog'
import { OrchestrationBoardCreateDialog } from './OrchestrationBoardCreateDialog'
import { useOrchestrationBoardLoad, ALL_REPOS } from './use-orchestration-board-load'
import { useOrchestrationBoardDetail } from './use-orchestration-board-detail'
import { useOrchestrationBoardActions } from './use-orchestration-board-actions'

export default function OrchestrationBoardPage(): React.JSX.Element {
  const closeOrchestrationBoardPage = useAppStore((s) => s.closeOrchestrationBoardPage)
  const setActiveView = useAppStore((s) => s.setActiveView)
  const openOrchestrationTaskDetails = useAppStore((s) => s.openOrchestrationTaskDetails)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const repoMap = useRepoMap()

  const {
    repoFilter,
    setRepoFilter,
    tasks,
    loading,
    error,
    truncated,
    scopeOptions,
    createDefaultWorktreeId,
    repoOptions,
    load
  } = useOrchestrationBoardLoad()

  const detail = useOrchestrationBoardDetail({ tasks, load })
  const actions = useOrchestrationBoardActions({
    selectedSquadId: detail.selectedSquadId,
    load,
    loadThread: detail.loadThread,
    openTask: detail.openTask,
    closeTask: detail.closeTask,
    thread: detail.thread
  })

  const [createOpen, setCreateOpen] = React.useState(false)
  const [createSubmitting, setCreateSubmitting] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)
  const [productStarting, setProductStarting] = React.useState(false)
  const [productGoalOpen, setProductGoalOpen] = React.useState(false)
  const [assigningTaskId, setAssigningTaskId] = React.useState<string | null>(null)
  const [taskActionId, setTaskActionId] = React.useState<string | null>(null)

  const repoLabelFor = useMemo(
    () => (repoId: string) => repoMap.get(repoId)?.displayName ?? repoId,
    [repoMap]
  )

  const showDetail = Boolean(detail.selectedId && detail.activeTask)
  const showBoard =
    !showDetail || detail.detailLayout === 'split' || detail.detailLayout === 'modal'
  const showMainDetail =
    showDetail && (detail.detailLayout === 'split' || detail.detailLayout === 'full')
  const showModalDetail = showDetail && detail.detailLayout === 'modal'

  // Why: the modal's "Open in main window" asks for a real dock into the project
  // main tab strip, not just an internal layout switch. Reuse the same store
  // action the task-detail tab host uses so it lands in the editor main box.
  const handleModalLayoutChange = (layout: OrchestrationBoardDetailLayout): void => {
    const active = detail.activeTask
    if (layout !== 'modal' && active) {
      const worktreeId = active.worktree_id || activeWorktreeId
      if (worktreeId) {
        openOrchestrationTaskDetails(worktreeId, { task: active })
        detail.closeTask()
        // Why: dock replaces the board with the project main box. openOrchestrationTaskDetails
        // already sets the active worktree, so landing on the 'terminal' view shows the
        // editor main box with the new task-detail tab (works even if the board was opened
        // from a non-editor view).
        setActiveView('terminal')
        return
      }
    }
    detail.setDetailLayout(layout)
  }

  const handleStartProductSubmit = async (goal: string): Promise<void> => {
    if (!goal.trim()) {
      return
    }
    setProductGoalOpen(false)
    setProductStarting(true)
    try {
      const repoId = repoFilter !== ALL_REPOS ? repoFilter : null
      if (!repoId) {
        setProductStarting(false)
        return
      }
      await callRuntimeRpc(
        { kind: 'local' as const },
        'orchestration.productStart',
        {
          goal: goal.trim(),
          repo: `id:${repoId}`,
          createIssue: true,
          ensureSquads: true,
          autoDispatch: true,
          waitTimeoutMs: 90_000
        },
        { timeoutMs: 180_000, skipCompatibilityCheck: true }
      )
      await load({ showSpinner: false })
    } finally {
      setProductStarting(false)
    }
  }

  const handleCreate = async (draft: {
    spec: string
    title?: string
    priority?: string
    repoId?: string | null
    worktreeId?: string | null
  }): Promise<void> => {
    setCreateSubmitting(true)
    setCreateError(null)
    try {
      await callRuntimeRpc(
        { kind: 'local' as const },
        'orchestration.taskCreate',
        {
          spec: draft.spec,
          ...(draft.title ? { taskTitle: draft.title, displayName: draft.title } : {}),
          priority: draft.priority,
          ...(draft.repoId ? { repoId: draft.repoId } : {}),
          ...(draft.worktreeId ? { worktreeId: draft.worktreeId } : {}),
          hostId: 'local'
        },
        { timeoutMs: 15_000, skipCompatibilityCheck: true }
      )
      setCreateOpen(false)
      await load({ showSpinner: false })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreateSubmitting(false)
    }
  }

  const activeTask = detail.activeTask

  const activeParentTask = useMemo(() => {
    if (!activeTask?.parent_id) {
      return null
    }
    return tasks.find((t) => t.id === activeTask.parent_id) ?? null
  }, [activeTask, tasks])

  const activeSubtasks = useMemo(() => {
    if (!activeTask) {
      return []
    }
    return tasks.filter((t) => t.parent_id === activeTask.id)
  }, [activeTask, tasks])

  const handleAddSubtask = useCallback(
    async (title: string) => {
      if (!activeTask) {
        return
      }
      const trimmed = title.trim()
      if (!trimmed) {
        return
      }
      try {
        await callRuntimeRpc(
          { kind: 'local' as const },
          'orchestration.taskCreate',
          {
            spec: trimmed,
            taskTitle: trimmed,
            displayName: trimmed,
            parent: activeTask.id,
            ...(activeTask.repo_id ? { repoId: activeTask.repo_id } : {}),
            ...(activeTask.worktree_id ? { worktreeId: activeTask.worktree_id } : {}),
            priority: 'medium',
            hostId: 'local'
          },
          { timeoutMs: 15_000, skipCompatibilityCheck: true }
        )
        await load({ showSpinner: false })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
    [activeTask, load]
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <OrchestrationBoardHeader
        taskCount={tasks.length}
        truncated={truncated}
        loading={loading}
        repoFilter={repoFilter}
        allReposId={ALL_REPOS}
        repoOptions={repoOptions}
        repoLabel={repoLabelFor}
        selectedSquadId={detail.selectedSquadId}
        squads={detail.squads}
        productStarting={productStarting}
        onBack={() => closeOrchestrationBoardPage()}
        onRepoFilterChange={setRepoFilter}
        onSquadChange={detail.setSelectedSquadId}
        onRefresh={() => {
          void load({ showSpinner: true })
        }}
        onStartProduct={() => setProductGoalOpen(true)}
        onNewTask={() => {
          setCreateError(null)
          setCreateOpen(true)
        }}
      />

      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showBoard ? (
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <OrchestrationBoardWorkspace tasks={tasks} onSelectTask={detail.openTask} />
          </div>
        ) : null}

        {showMainDetail && activeTask ? (
          <div
            className={
              detail.detailLayout === 'full'
                ? 'min-h-0 min-w-0 flex-1'
                : 'min-h-0 w-full max-w-[min(720px,52vw)] shrink-0 xl:max-w-[760px]'
            }
          >
            <OrchestrationBoardDetailPane
              task={activeTask}
              thread={detail.thread}
              threadLoading={detail.threadLoading}
              commentDraft={detail.commentDraft}
              commentSubmitting={detail.commentSubmitting}
              selectedSquadId={detail.selectedSquadId}
              squadsEmpty={detail.squads.length === 0}
              assigning={assigningTaskId === activeTask.id}
              actionBusy={taskActionId === activeTask.id}
              repoLabel={activeTask.repo_id ? repoLabelFor(activeTask.repo_id) : null}
              mentionOptions={detail.mentionOptions}
              layout={detail.detailLayout === 'full' ? 'full' : 'split'}
              autopilotBusy={actions.autopilotBusy}
              onLayoutChange={detail.setDetailLayout}
              onClose={detail.closeTask}
              onCommentDraftChange={detail.setCommentDraft}
              onPostComment={(parentId) => {
                void detail.handlePostComment(parentId)
              }}
              onReply={(comment) => {
                detail.setReplyParentId(comment.id)
                detail.setCommentDraft((prev) => (prev.trim() ? prev : `@${comment.author} `))
              }}
              onRefreshThread={() => {
                void detail.loadThread(activeTask.id)
              }}
              onAssign={() => {
                setAssigningTaskId(activeTask.id)
                void actions.handleAssignSquad(activeTask).finally(() => setAssigningTaskId(null))
              }}
              onRetry={() => {
                setTaskActionId(activeTask.id)
                void actions.handleRetryTask(activeTask).finally(() => setTaskActionId(null))
              }}
              onToggleAutopilot={(enabled) => {
                void actions.handleToggleAutopilot(activeTask, enabled)
              }}
              onStop={() => {
                setTaskActionId(activeTask.id)
                void actions.handleStopTask(activeTask).finally(() => setTaskActionId(null))
              }}
              onDelete={() => {
                setTaskActionId(activeTask.id)
                void actions.handleDeleteTask(activeTask).finally(() => setTaskActionId(null))
              }}
              onOpenStageTask={(taskId) => {
                void detail.handleOpenStageTask(taskId)
              }}
              subtasks={activeSubtasks}
              onOpenTask={detail.openTask}
              onAddSubtask={(title) => {
                void handleAddSubtask(title)
              }}
              parentTask={activeParentTask}
              onOpenParent={activeParentTask ? () => detail.openTask(activeParentTask) : undefined}
            />
          </div>
        ) : null}
      </div>

      <OrchestrationProductGoalDialog
        open={productGoalOpen}
        onOpenChange={setProductGoalOpen}
        starting={productStarting}
        onSubmit={(goal) => {
          void handleStartProductSubmit(goal)
        }}
      />

      <OrchestrationBoardCreateDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) {
            setCreateError(null)
          }
        }}
        scopeOptions={scopeOptions}
        defaultRepoId={repoFilter === ALL_REPOS ? null : repoFilter}
        defaultWorktreeId={createDefaultWorktreeId}
        submitting={createSubmitting}
        error={createError}
        onSubmit={(draft) => {
          void handleCreate(draft)
        }}
      />

      {showModalDetail && activeTask ? (
        <OrchestrationBoardDetailPane
          task={activeTask}
          thread={detail.thread}
          threadLoading={detail.threadLoading}
          commentDraft={detail.commentDraft}
          commentSubmitting={detail.commentSubmitting}
          selectedSquadId={detail.selectedSquadId}
          squadsEmpty={detail.squads.length === 0}
          assigning={assigningTaskId === activeTask.id}
          actionBusy={taskActionId === activeTask.id}
          repoLabel={activeTask.repo_id ? repoLabelFor(activeTask.repo_id) : null}
          mentionOptions={detail.mentionOptions}
          layout="modal"
          autopilotBusy={actions.autopilotBusy}
          onLayoutChange={handleModalLayoutChange}
          onClose={detail.closeTask}
          onCommentDraftChange={detail.setCommentDraft}
          onPostComment={(parentId) => {
            void detail.handlePostComment(parentId)
          }}
          onReply={(comment) => {
            detail.setReplyParentId(comment.id)
            detail.setCommentDraft((prev) => (prev.trim() ? prev : `@${comment.author} `))
          }}
          onRefreshThread={() => {
            void detail.loadThread(activeTask.id)
          }}
          onAssign={() => {
            setAssigningTaskId(activeTask.id)
            void actions.handleAssignSquad(activeTask).finally(() => setAssigningTaskId(null))
          }}
          onRetry={() => {
            setTaskActionId(activeTask.id)
            void actions.handleRetryTask(activeTask).finally(() => setTaskActionId(null))
          }}
          onToggleAutopilot={(enabled) => {
            void actions.handleToggleAutopilot(activeTask, enabled)
          }}
          onStop={() => {
            setTaskActionId(activeTask.id)
            void actions.handleStopTask(activeTask).finally(() => setTaskActionId(null))
          }}
          onDelete={() => {
            setTaskActionId(activeTask.id)
            void actions.handleDeleteTask(activeTask).finally(() => setTaskActionId(null))
          }}
          onOpenStageTask={(taskId) => {
            void detail.handleOpenStageTask(taskId)
          }}
          subtasks={activeSubtasks}
          onOpenTask={detail.openTask}
          onAddSubtask={(title) => {
            void handleAddSubtask(title)
          }}
          parentTask={activeParentTask}
          onOpenParent={activeParentTask ? () => detail.openTask(activeParentTask) : undefined}
        />
      ) : null}
    </div>
  )
}
