import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { OrchestrationBoardTask } from './orchestration-board-model'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }

/**
 * Child-task list + creation for a task detail surface. Loads children via
 * taskList(parent) and creates children with taskCreate(parent).
 */
export function useOrchestrationTaskSubtasks(
  parentTask: OrchestrationBoardTask,
  onChanged?: () => void
): {
  subtasks: OrchestrationBoardTask[]
  onAddSubtask: (title: string) => Promise<void>
} {
  const [subtasks, setSubtasks] = useState<OrchestrationBoardTask[]>([])

  const loadSubtasks = useCallback(async (taskId: string) => {
    try {
      const result = await callRuntimeRpc<{ tasks: OrchestrationBoardTask[] }>(
        LOCAL_RUNTIME_TARGET,
        'orchestration.taskList',
        { parent: taskId },
        { timeoutMs: 15_000, skipCompatibilityCheck: true }
      )
      setSubtasks(result.tasks ?? [])
    } catch {
      setSubtasks([])
    }
  }, [])

  useEffect(() => {
    void loadSubtasks(parentTask.id)
  }, [parentTask.id, loadSubtasks])

  const onAddSubtask = useCallback(
    async (title: string) => {
      const trimmed = title.trim()
      if (!trimmed) {
        return
      }
      try {
        await callRuntimeRpc(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskCreate',
          {
            spec: trimmed,
            taskTitle: trimmed,
            displayName: trimmed,
            parent: parentTask.id,
            ...(parentTask.repo_id ? { repoId: parentTask.repo_id } : {}),
            ...(parentTask.worktree_id ? { worktreeId: parentTask.worktree_id } : {}),
            priority: 'medium',
            hostId: 'local'
          },
          { timeoutMs: 15_000, skipCompatibilityCheck: true }
        )
        await loadSubtasks(parentTask.id)
        onChanged?.()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
    [loadSubtasks, onChanged, parentTask.id, parentTask.repo_id, parentTask.worktree_id]
  )

  return { subtasks, onAddSubtask }
}
