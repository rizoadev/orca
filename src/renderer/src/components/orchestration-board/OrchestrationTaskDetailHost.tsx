/**
 * Standalone task detail host (modal) for surfaces outside the full board —
 * e.g. right-sidebar orchestration list. Thread/comment and action handlers
 * live in dedicated hooks so this file stays small.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import { normalizeAgentSquads } from '../../../../shared/agent-squads'
import {
  OrchestrationBoardTaskDialog,
  type OrchestrationBoardMentionOption
} from './OrchestrationBoardTaskDialog'
import type { OrchestrationBoardTask } from './orchestration-board-model'
import { useOrchestrationTaskThread } from './use-orchestration-task-thread'
import { useOrchestrationTaskDetailActions } from './use-orchestration-task-detail-actions'
import { useOrchestrationTaskSubtasks } from './use-orchestration-task-subtasks'

export function OrchestrationTaskDetailHost({
  task,
  onClose,
  onChanged,
  layout = 'modal'
}: {
  task: OrchestrationBoardTask
  onClose: () => void
  onChanged?: () => void
  /** modal = covering drawer; full = docked project main-box tab. */
  layout?: 'modal' | 'embedded'
}): React.JSX.Element {
  const repoMap = useRepoMap()
  const openOrchestrationTaskDetails = useAppStore((s) => s.openOrchestrationTaskDetails)
  const openOrchestrationBoardPage = useAppStore((s) => s.openOrchestrationBoardPage)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const agentSquads = useAppStore((s) => s.settings?.agentSquads)
  const squads = useMemo(() => normalizeAgentSquads(agentSquads ?? []), [agentSquads])

  const [selectedSquadId, setSelectedSquadId] = useState('')

  const threadApi = useOrchestrationTaskThread(onChanged)
  const { activeTask, thread, pipelineId } = threadApi
  const resolvedTask = activeTask ?? task
  const { subtasks, onAddSubtask } = useOrchestrationTaskSubtasks(resolvedTask, onChanged)

  const actions = useOrchestrationTaskDetailActions(
    { selectedSquadId, onChanged, onClose },
    {
      activeTask,
      setActiveTask: threadApi.setActiveTask,
      thread,
      setThread: threadApi.setThread,
      pipelineId,
      setPipelineId: threadApi.setPipelineId,
      loadThread: threadApi.loadThread
    }
  )

  useEffect(() => {
    threadApi.setActiveTask(task)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setter is stable.
  }, [task])

  useEffect(() => {
    if (squads.length === 0) {
      setSelectedSquadId('')
      return
    }
    if (!squads.some((s) => s.id === selectedSquadId)) {
      setSelectedSquadId(squads[0]!.id)
    }
  }, [selectedSquadId, squads])

  useEffect(() => {
    void threadApi.loadThread(resolvedTask.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loader is stable.
  }, [resolvedTask.id])

  const mentionOptions = useMemo((): OrchestrationBoardMentionOption[] => {
    const options: OrchestrationBoardMentionOption[] = []
    const seen = new Set<string>()
    const push = (opt: OrchestrationBoardMentionOption): void => {
      if (seen.has(opt.id)) {
        return
      }
      seen.add(opt.id)
      options.push(opt)
    }
    if (thread?.inCharge.handle) {
      push({
        id: `agent:${thread.inCharge.handle}`,
        label: thread.inCharge.handle,
        insert: `@${thread.inCharge.handle}`,
        kind: 'agent'
      })
    }
    for (const row of thread?.roster ?? []) {
      if (row.assignee) {
        push({
          id: `agent:${row.assignee}`,
          label: row.assignee,
          insert: `@${row.assignee}`,
          kind: 'agent'
        })
      }
      if (row.role) {
        push({
          id: `role:${row.role}`,
          label: `role:${row.role}`,
          insert: `@role:${row.role}`,
          kind: 'role'
        })
      }
    }
    for (const squad of squads) {
      push({
        id: `squad:${squad.id}`,
        label: `squad:${squad.name}`,
        insert: `@squad:${squad.id}`,
        kind: 'squad'
      })
    }
    return options.slice(0, 12)
  }, [squads, thread])

  return (
    <OrchestrationBoardTaskDialog
      task={resolvedTask}
      thread={thread}
      threadLoading={threadApi.threadLoading}
      commentDraft={threadApi.commentDraft}
      commentSubmitting={threadApi.commentSubmitting}
      selectedSquadId={selectedSquadId}
      squadsEmpty={squads.length === 0}
      assigning={actions.assigning}
      actionBusy={actions.actionBusy}
      repoLabel={
        resolvedTask.repo_id
          ? (repoMap.get(resolvedTask.repo_id)?.displayName ?? resolvedTask.repo_id)
          : null
      }
      mentionOptions={mentionOptions}
      layout={layout}
      onLayoutChange={
        layout === 'modal'
          ? (next) => {
              // Why: dock into the current project main tab strip — stay on workspace, keep right sidebar.
              if (next === 'split' || next === 'full') {
                const worktreeId = resolvedTask.worktree_id || activeWorktreeId
                if (!worktreeId) {
                  toast.error(
                    translate(
                      'auto.components.orchestration.board.needWorktree',
                      'Open a project worktree first.'
                    )
                  )
                  return
                }
                openOrchestrationTaskDetails(worktreeId, { task: resolvedTask })
                onClose()
              }
            }
          : undefined
      }
      onClose={onClose}
      onCommentDraftChange={threadApi.setCommentDraft}
      onPostComment={(parentId) => {
        void threadApi.handlePostComment(parentId)
      }}
      onReply={(comment) => {
        threadApi.setReplyParentId(comment.id)
        threadApi.setCommentDraft((prev) => (prev.trim() ? prev : `@${comment.author} `))
      }}
      onRefreshThread={() => {
        void threadApi.loadThread(resolvedTask.id)
      }}
      onAssign={() => {
        void actions.handleAssign()
      }}
      onRetry={() => {
        void actions.handleRetry()
      }}
      autopilotBusy={actions.autopilotBusy}
      onToggleAutopilot={(enabled) => {
        void actions.handleToggleAutopilot(enabled)
      }}
      onStop={() => {
        void actions.handleStop()
      }}
      onDelete={() => {
        void actions.handleDelete()
      }}
      onOpenStageTask={(taskId) => {
        void actions.handleOpenStageTask(taskId)
      }}
      onOpenTask={(ancestor) => {
        void actions.handleOpenStageTask(ancestor.id)
      }}
      subtasks={subtasks}
      onAddSubtask={(title) => {
        void onAddSubtask(title)
      }}
      onOpenBoard={() => {
        openOrchestrationBoardPage({ taskId: resolvedTask.id })
      }}
    />
  )
}
