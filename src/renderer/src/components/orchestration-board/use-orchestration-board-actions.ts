import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import type { OrchestrationBoardTaskThread } from './OrchestrationBoardTaskDialog'
import type { OrchestrationBoardTask } from './orchestration-board-model'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }

export function useOrchestrationBoardActions({
  selectedSquadId,
  load,
  loadThread,
  openTask,
  closeTask,
  thread
}: {
  selectedSquadId: string
  load: (opts?: { showSpinner?: boolean }) => Promise<void>
  loadThread: (taskId: string) => Promise<void>
  openTask: (task: OrchestrationBoardTask) => void
  closeTask: () => void
  thread: OrchestrationBoardTaskThread | null
}): {
  handleToggleAutopilot: (task: OrchestrationBoardTask, enabled: boolean) => Promise<void>
  handleRetryTask: (task: OrchestrationBoardTask) => Promise<void>
  handleStopTask: (task: OrchestrationBoardTask) => Promise<void>
  handleDeleteTask: (task: OrchestrationBoardTask) => Promise<void>
  handleAssignSquad: (task: OrchestrationBoardTask) => Promise<void>
  autopilotBusy: boolean
} {
  const [autopilotBusy, setAutopilotBusy] = useState(false)

  const handleToggleAutopilot = useCallback(
    async (task: OrchestrationBoardTask, enabled: boolean) => {
      const rootId = task.pipeline_id || thread?.pipelineId
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
        toast.success(
          result.autopilot
            ? translate(
                'auto.components.orchestration.board.autopilot.on',
                'Autopilot ON — residual TODOs loop to manager'
              )
            : translate('auto.components.orchestration.board.autopilot.off', 'Autopilot OFF')
        )
        await loadThread(task.id)
        await load({ showSpinner: false })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setAutopilotBusy(false)
      }
    },
    [load, loadThread, thread?.pipelineId]
  )

  const handleRetryTask = useCallback(
    async (task: OrchestrationBoardTask) => {
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
            reason: 'Retried from orchestration board after stop/error',
            assign: true,
            inject: true,
            spawnIfMissing: true,
            ...(selectedSquadId ? { squad: selectedSquadId } : {}),
            waitTimeoutMs: 60_000
          },
          { timeoutMs: 90_000, skipCompatibilityCheck: true }
        )
        if (result.task) {
          openTask({
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
        await load({ showSpinner: false })
        if (result.task?.id) {
          await loadThread(result.task.id)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
    [load, loadThread, openTask, selectedSquadId]
  )

  const handleStopTask = useCallback(
    async (task: OrchestrationBoardTask) => {
      try {
        await callRuntimeRpc(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskStop',
          { id: task.id, reason: 'Stopped from orchestration board' },
          { timeoutMs: 15_000, skipCompatibilityCheck: true }
        )
        toast.success(
          translate('auto.components.orchestration.board.stop.success', 'Stopped {id}', {
            id: task.id
          })
        )
        closeTask()
        await load({ showSpinner: false })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
    [closeTask, load]
  )

  const handleDeleteTask = useCallback(
    async (task: OrchestrationBoardTask) => {
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
        closeTask()
        await load({ showSpinner: false })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
    [closeTask, load]
  )

  const handleAssignSquad = useCallback(
    async (task: OrchestrationBoardTask) => {
      if (!selectedSquadId) {
        toast.error(
          translate(
            'auto.components.orchestration.board.assign.noSquad',
            'Create a squad in Settings → Orchestration first.'
          )
        )
        return
      }
      if (task.status !== 'ready' && task.status !== 'pending') {
        toast.error(
          translate(
            'auto.components.orchestration.board.assign.notReady',
            'Only ready tasks can be assigned to a squad.'
          )
        )
        return
      }
      try {
        if (task.status === 'pending') {
          throw new Error(
            'Task is pending dependencies. Wait until it is ready, or remove deps before assigning.'
          )
        }
        const result = await callRuntimeRpc<{
          task: OrchestrationBoardTask | null
          dispatch: { id: string; status: string } | null
          to: string
          injected: boolean
          spawned: boolean
          squad: { id: string; name: string; routing: string }
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
        await load({ showSpinner: false })
        if (result.task) {
          openTask(result.task)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
    [load, openTask, selectedSquadId]
  )

  return {
    handleToggleAutopilot,
    handleRetryTask,
    handleStopTask,
    handleDeleteTask,
    handleAssignSquad,
    autopilotBusy
  }
}
