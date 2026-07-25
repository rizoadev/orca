/**
 * Standalone task detail host (modal) for surfaces outside the full board —
 * e.g. right-sidebar orchestration list.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useRepoMap } from '@/store/selectors'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { normalizeAgentSquads } from '../../../../shared/agent-squads'
import {
  OrchestrationBoardTaskDialog,
  type OrchestrationBoardMentionOption,
  type OrchestrationBoardTaskThread
} from './OrchestrationBoardTaskDialog'
import type {
  OrchestrationBoardComment,
  OrchestrationBoardInCharge,
  OrchestrationBoardRosterRow,
  OrchestrationBoardTask
} from './orchestration-board-model'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }

type TaskThreadResult = {
  task: OrchestrationBoardTask
  comments: OrchestrationBoardComment[]
  roster: OrchestrationBoardRosterRow[]
  inCharge: OrchestrationBoardInCharge
  autopilot?: boolean
  pipelineId?: string | null
}

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
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const agentSquads = useAppStore((s) => s.settings?.agentSquads)
  const squads = useMemo(() => normalizeAgentSquads(agentSquads ?? []), [agentSquads])
  const [selectedSquadId, setSelectedSquadId] = useState('')
  const [activeTask, setActiveTask] = useState(task)
  const [thread, setThread] = useState<OrchestrationBoardTaskThread | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [replyParentId, setReplyParentId] = useState<string | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [autopilotBusy, setAutopilotBusy] = useState(false)
  const [pipelineId, setPipelineId] = useState<string | null>(task.pipeline_id ?? null)

  useEffect(() => {
    setActiveTask(task)
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

  const loadThread = useCallback(async (taskId: string) => {
    setThreadLoading(true)
    try {
      const result = await callRuntimeRpc<TaskThreadResult>(
        LOCAL_RUNTIME_TARGET,
        'orchestration.taskThread',
        { task: taskId },
        { timeoutMs: 15_000, skipCompatibilityCheck: true }
      )
      setThread({
        ...result,
        autopilot: result.autopilot === true,
        pipelineId: result.pipelineId ?? result.task?.pipeline_id ?? null
      })
      setPipelineId(result.pipelineId ?? result.task?.pipeline_id ?? null)
      if (result.task) {
        setActiveTask(result.task)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setThreadLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadThread(activeTask.id)
  }, [activeTask.id, loadThread])

  const handlePostComment = useCallback(
    async (parentId?: string | null) => {
      if (!commentDraft.trim()) {
        return
      }
      setCommentSubmitting(true)
      try {
        const result = await callRuntimeRpc<{
          notified?: { handle: string; injected: boolean; error?: string }[]
          warning?: string
        }>(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskCommentAdd',
          {
            task: activeTask.id,
            body: commentDraft.trim(),
            author: 'operator',
            kind: 'comment',
            notify: true,
            reassign: true,
            ...(parentId || replyParentId ? { parentId: parentId ?? replyParentId } : {})
          },
          { timeoutMs: 45_000, skipCompatibilityCheck: true }
        )
        setCommentDraft('')
        setReplyParentId(null)
        const injected = (result.notified ?? []).filter((n) => n.injected).map((n) => n.handle)
        if (injected.length > 0) {
          toast.success(
            translate(
              'auto.components.orchestration.board.comment.notified',
              'Comment posted · assigned to {handles}',
              { handles: injected.join(', ') }
            )
          )
        } else if (result.warning) {
          toast.message(
            translate(
              'auto.components.orchestration.board.comment.postedNoAgent',
              'Comment posted · no agent notified'
            ),
            { description: result.warning }
          )
        } else {
          toast.success(
            translate('auto.components.orchestration.board.comment.posted', 'Comment posted')
          )
        }
        await loadThread(activeTask.id)
        onChanged?.()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setCommentSubmitting(false)
      }
    },
    [activeTask.id, commentDraft, loadThread, onChanged, replyParentId]
  )

  const handleAssign = useCallback(async () => {
    if (!selectedSquadId) {
      toast.error(
        translate(
          'auto.components.orchestration.board.assign.noSquad',
          'Create a squad in Settings → Orchestration first.'
        )
      )
      return
    }
    setAssigning(true)
    try {
      const result = await callRuntimeRpc<{
        task: OrchestrationBoardTask | null
        to: string
        squad: { name: string }
      }>(
        LOCAL_RUNTIME_TARGET,
        'orchestration.taskAssignSquad',
        {
          task: activeTask.id,
          squad: selectedSquadId,
          inject: true,
          spawnIfMissing: true,
          waitTimeoutMs: 45_000
        },
        { timeoutMs: 60_000, skipCompatibilityCheck: true }
      )
      toast.success(
        translate(
          'auto.components.orchestration.board.assign.success',
          'Assigned to {squad} → {handle}',
          { squad: result.squad.name, handle: result.to }
        )
      )
      if (result.task) {
        setActiveTask(result.task)
      }
      await loadThread(activeTask.id)
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setAssigning(false)
    }
  }, [activeTask.id, loadThread, onChanged, selectedSquadId])

  const handleToggleAutopilot = useCallback(
    async (enabled: boolean) => {
      const rootId = pipelineId || activeTask.pipeline_id
      if (!rootId) {
        toast.error(
          translate(
            'auto.components.orchestration.board.autopilot.needPipeline',
            'Autopilot is only available for product pipeline tasks.'
          )
        )
        return
      }
      setAutopilotBusy(true)
      try {
        const result = await callRuntimeRpc<{ autopilot: boolean }>(
          LOCAL_RUNTIME_TARGET,
          'orchestration.productAutopilot',
          { pipeline: rootId, enabled },
          { timeoutMs: 60_000, skipCompatibilityCheck: true }
        )
        setThread((prev) =>
          prev
            ? { ...prev, autopilot: result.autopilot === true, pipelineId: rootId }
            : prev
        )
        toast.success(
          result.autopilot
            ? translate(
                'auto.components.orchestration.board.autopilot.on',
                'Autopilot ON — residual TODOs loop to manager'
              )
            : translate(
                'auto.components.orchestration.board.autopilot.off',
                'Autopilot OFF'
              )
        )
        await loadThread(activeTask.id)
        onChanged?.()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setAutopilotBusy(false)
      }
    },
    [activeTask.id, activeTask.pipeline_id, loadThread, onChanged, pipelineId]
  )

  const handleRetry = useCallback(async () => {
    setActionBusy(true)
    try {
      const result = await callRuntimeRpc<{
        task: OrchestrationBoardTask
        retriedIds: string[]
        assigned: boolean
        to?: string
        warning?: string
      }>(
        LOCAL_RUNTIME_TARGET,
        'orchestration.taskRetry',
        {
          id: activeTask.id,
          reason: 'Retried from task detail after stop/error',
          assign: true,
          inject: true,
          spawnIfMissing: true,
          ...(selectedSquadId ? { squad: selectedSquadId } : {}),
          waitTimeoutMs: 60_000
        },
        { timeoutMs: 90_000, skipCompatibilityCheck: true }
      )
      // Why: stamp assignee immediately so running-agent badges rematch before hook context catches up.
      if (result.task) {
        setActiveTask({
          ...result.task,
          assignee_handle: result.to ?? result.task.assignee_handle ?? null,
          status: result.assigned ? 'dispatched' : result.task.status
        })
      } else if (result.to) {
        setActiveTask((prev) => ({
          ...prev,
          assignee_handle: result.to ?? prev.assignee_handle,
          status: result.assigned ? 'dispatched' : prev.status
        }))
      }
      if (result.assigned && result.to) {
        toast.success(
          translate(
            'auto.components.orchestration.board.retry.successAssigned',
            'Retried · assigned {handle}',
            { handle: result.to }
          )
        )
      } else if (result.warning) {
        toast.message(
          translate(
            'auto.components.orchestration.board.retry.partial',
            'Task reopened for retry'
          ),
          { description: result.warning }
        )
      } else {
        toast.success(
          translate('auto.components.orchestration.board.retry.success', 'Task retried')
        )
      }
      await loadThread(result.task?.id ?? activeTask.id)
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setActionBusy(false)
    }
  }, [activeTask.id, loadThread, onChanged, selectedSquadId])

  const handleStop = useCallback(async () => {
    setActionBusy(true)
    try {
      await callRuntimeRpc(
        LOCAL_RUNTIME_TARGET,
        'orchestration.taskStop',
        { id: activeTask.id, reason: 'Stopped from orchestration task detail' },
        { timeoutMs: 15_000, skipCompatibilityCheck: true }
      )
      toast.success(
        translate('auto.components.orchestration.board.stop.success', 'Stopped {id}', {
          id: activeTask.id
        })
      )
      onChanged?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setActionBusy(false)
    }
  }, [activeTask.id, onChanged, onClose])

  const handleDelete = useCallback(async () => {
    const ok = window.confirm(
      translate(
        'auto.components.orchestration.board.delete.confirm',
        'Delete {id}? This cannot be undone.',
        { id: activeTask.id }
      )
    )
    if (!ok) {
      return
    }
    setActionBusy(true)
    try {
      await callRuntimeRpc(
        LOCAL_RUNTIME_TARGET,
        'orchestration.taskDelete',
        { id: activeTask.id },
        { timeoutMs: 15_000, skipCompatibilityCheck: true }
      )
      toast.success(
        translate('auto.components.orchestration.board.delete.success', 'Deleted {id}', {
          id: activeTask.id
        })
      )
      onChanged?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setActionBusy(false)
    }
  }, [activeTask.id, onChanged, onClose])

  const handleOpenStageTask = useCallback(
    async (taskId: string) => {
      try {
        const result = await callRuntimeRpc<TaskThreadResult>(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskThread',
          { task: taskId },
          { timeoutMs: 15_000, skipCompatibilityCheck: true }
        )
        if (result.task) {
          setActiveTask(result.task)
          setThread(result)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
    []
  )

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
      task={activeTask}
      thread={thread}
      threadLoading={threadLoading}
      commentDraft={commentDraft}
      commentSubmitting={commentSubmitting}
      selectedSquadId={selectedSquadId}
      squadsEmpty={squads.length === 0}
      assigning={assigning}
      actionBusy={actionBusy}
      repoLabel={
        activeTask.repo_id
          ? (repoMap.get(activeTask.repo_id)?.displayName ?? activeTask.repo_id)
          : null
      }
      mentionOptions={mentionOptions}
      layout={layout}
      onLayoutChange={
        layout === 'modal'
          ? (next) => {
              // Why: dock into the current project main tab strip — stay on workspace, keep right sidebar.
              if (next === 'split' || next === 'full') {
                const worktreeId = activeTask.worktree_id || activeWorktreeId
                if (!worktreeId) {
                  toast.error(
                    translate(
                      'auto.components.orchestration.board.needWorktree',
                      'Open a project worktree first.'
                    )
                  )
                  return
                }
                openOrchestrationTaskDetails(worktreeId, { task: activeTask })
                onClose()
              }
            }
          : undefined
      }
      onClose={onClose}
      onCommentDraftChange={setCommentDraft}
      onPostComment={(parentId) => {
        void handlePostComment(parentId)
      }}
      onReply={(comment) => {
        setReplyParentId(comment.id)
        setCommentDraft((prev) => (prev.trim() ? prev : `@${comment.author} `))
      }}
      onRefreshThread={() => {
        void loadThread(activeTask.id)
      }}
      onAssign={() => {
        void handleAssign()
      }}
      onRetry={() => {
        void handleRetry()
      }}
      autopilotBusy={autopilotBusy}
      onToggleAutopilot={(enabled) => {
        void handleToggleAutopilot(enabled)
      }}
      onStop={() => {
        void handleStop()
      }}
      onDelete={() => {
        void handleDelete()
      }}
      onOpenStageTask={(taskId) => {
        void handleOpenStageTask(taskId)
      }}
    />
  )
}
