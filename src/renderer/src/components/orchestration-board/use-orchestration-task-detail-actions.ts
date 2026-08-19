import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import type { OrchestrationBoardTask } from './orchestration-board-model'
import type { OrchestrationBoardTaskThread } from './OrchestrationBoardTaskDialog'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }

export type OrchestrationTaskDetailActionsOptions = {
  selectedSquadId: string
  onChanged?: () => void
  onClose: () => void
}

/**
 * Task-detail action handlers (assign, autopilot, retry, stop, delete, stage
 * navigation). The thread hook owns activeTask/thread; this hook mutates them
 * through the setters it is given.
 */
export function useOrchestrationTaskDetailActions(
  options: OrchestrationTaskDetailActionsOptions,
  deps: {
    activeTask: OrchestrationBoardTask | null
    setActiveTask: (task: OrchestrationBoardTask) => void
    thread: OrchestrationBoardTaskThread | null
    setThread: (thread: OrchestrationBoardTaskThread) => void
    pipelineId: string | null
    setPipelineId: (id: string | null) => void
    loadThread: (taskId: string) => Promise<void>
  }
) {
  const { selectedSquadId, onChanged, onClose } = options
  const { activeTask, setActiveTask, thread, setThread, pipelineId, setPipelineId, loadThread } =
    deps

  const [assigning, setAssigning] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [autopilotBusy, setAutopilotBusy] = useState(false)

  const handleAssign = useCallback(async () => {
    const task = activeTask
    if (!task) {
      return
    }
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
          task: task.id,
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
      await loadThread(task.id)
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setAssigning(false)
    }
  }, [activeTask, loadThread, onChanged, selectedSquadId, setActiveTask])

  const handleToggleAutopilot = useCallback(
    async (enabled: boolean) => {
      const task = activeTask
      const rootId = pipelineId || task?.pipeline_id
      if (!task || !rootId) {
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
        setThread({
          ...thread!,
          autopilot: result.autopilot === true,
          pipelineId: rootId
        })
        toast.success(
          result.autopilot
            ? translate(
                'auto.components.orchestration.board.autopilot.on',
                'Autopilot ON — residual TODOs loop to manager'
              )
            : translate('auto.components.orchestration.board.autopilot.off', 'Autopilot OFF')
        )
        await loadThread(task.id)
        onChanged?.()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setAutopilotBusy(false)
      }
    },
    [activeTask, loadThread, onChanged, pipelineId, setThread, thread]
  )

  const handleRetry = useCallback(async () => {
    const task = activeTask
    if (!task) {
      return
    }
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
          id: task.id,
          reason: 'Retried from task detail after stop/error',
          assign: true,
          inject: true,
          spawnIfMissing: true,
          ...(selectedSquadId ? { squad: selectedSquadId } : {}),
          waitTimeoutMs: 60_000
        },
        { timeoutMs: 90_000, skipCompatibilityCheck: true }
      )
      if (result.task) {
        setActiveTask({
          ...result.task,
          assignee_handle: result.to ?? result.task.assignee_handle ?? null,
          status: result.assigned ? 'dispatched' : result.task.status
        })
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
          translate('auto.components.orchestration.board.retry.partial', 'Task reopened for retry'),
          { description: result.warning }
        )
      } else {
        toast.success(
          translate('auto.components.orchestration.board.retry.success', 'Task retried')
        )
      }
      await loadThread(result.task?.id ?? task.id)
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setActionBusy(false)
    }
  }, [activeTask, loadThread, onChanged, selectedSquadId, setActiveTask])

  const handleStop = useCallback(async () => {
    const task = activeTask
    if (!task) {
      return
    }
    setActionBusy(true)
    try {
      await callRuntimeRpc(
        LOCAL_RUNTIME_TARGET,
        'orchestration.taskStop',
        { id: task.id, reason: 'Stopped from orchestration task detail' },
        { timeoutMs: 15_000, skipCompatibilityCheck: true }
      )
      toast.success(
        translate('auto.components.orchestration.board.stop.success', 'Stopped {id}', {
          id: task.id
        })
      )
      onChanged?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setActionBusy(false)
    }
  }, [activeTask, onChanged, onClose])

  const handleDelete = useCallback(async () => {
    const task = activeTask
    if (!task) {
      return
    }
    const ok = window.confirm(
      translate(
        'auto.components.orchestration.board.delete.confirm',
        'Delete {id}? This cannot be undone.',
        { id: task.id }
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
        { id: task.id },
        { timeoutMs: 15_000, skipCompatibilityCheck: true }
      )
      toast.success(
        translate('auto.components.orchestration.board.delete.success', 'Deleted {id}', {
          id: task.id
        })
      )
      onChanged?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setActionBusy(false)
    }
  }, [activeTask, onChanged, onClose])

  const handleOpenStageTask = useCallback(
    async (taskId: string) => {
      try {
        const result = await callRuntimeRpc<{
          task: OrchestrationBoardTask
          pipelineId?: string | null
        }>(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskThread',
          { task: taskId },
          { timeoutMs: 15_000, skipCompatibilityCheck: true }
        )
        if (result.task) {
          setActiveTask(result.task)
        }
        setPipelineId(result.pipelineId ?? null)
        await loadThread(taskId)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
    [loadThread, setActiveTask, setPipelineId]
  )

  return {
    assigning,
    actionBusy,
    autopilotBusy,
    handleAssign,
    handleToggleAutopilot,
    handleRetry,
    handleStop,
    handleDelete,
    handleOpenStageTask
  }
}
