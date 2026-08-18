import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import type {
  OrchestrationBoardComment,
  OrchestrationBoardInCharge,
  OrchestrationBoardRosterRow,
  OrchestrationBoardTask
} from './orchestration-board-model'
import type { OrchestrationBoardTaskThread } from './OrchestrationBoardTaskDialog'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }

export type TaskThreadResult = {
  task: OrchestrationBoardTask
  comments: OrchestrationBoardComment[]
  roster: OrchestrationBoardRosterRow[]
  inCharge: OrchestrationBoardInCharge
  autopilot?: boolean
  pipelineId?: string | null
  ancestors?: OrchestrationBoardTask[]
}

/**
 * Thread + comment state for a task detail host: loads the task thread and
 * posts operator comments (with notify/reassign semantics).
 */
export function useOrchestrationTaskThread(onChanged?: () => void) {
  const [activeTask, setActiveTask] = useState<OrchestrationBoardTask | null>(null)
  const [thread, setThread] = useState<OrchestrationBoardTaskThread | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [replyParentId, setReplyParentId] = useState<string | null>(null)
  const [pipelineId, setPipelineId] = useState<string | null>(null)

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

  const handlePostComment = useCallback(
    async (parentId?: string | null) => {
      const task = activeTask
      if (!task || !commentDraft.trim()) {
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
            task: task.id,
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
        await loadThread(task.id)
        onChanged?.()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setCommentSubmitting(false)
      }
    },
    [activeTask, commentDraft, loadThread, onChanged, replyParentId]
  )

  return {
    activeTask,
    setActiveTask,
    thread,
    setThread,
    threadLoading,
    commentDraft,
    setCommentDraft,
    commentSubmitting,
    replyParentId,
    setReplyParentId,
    pipelineId,
    setPipelineId,
    loadThread,
    handlePostComment
  }
}
