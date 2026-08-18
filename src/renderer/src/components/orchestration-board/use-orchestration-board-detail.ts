import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { normalizeAgentSquads } from '../../../../shared/agent-squads'
import type {
  OrchestrationBoardDetailLayout,
  OrchestrationBoardMentionOption,
  OrchestrationBoardTaskThread
} from './OrchestrationBoardTaskDialog'
import type { OrchestrationBoardTask } from './orchestration-board-model'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }

export function useOrchestrationBoardDetail({
  tasks,
  load
}: {
  tasks: OrchestrationBoardTask[]
  load: (opts?: { showSpinner?: boolean }) => Promise<void>
}): {
  selectedId: string | null
  activeTask: OrchestrationBoardTask | null
  detailLayout: OrchestrationBoardDetailLayout
  setDetailLayout: (layout: OrchestrationBoardDetailLayout) => void
  thread: OrchestrationBoardTaskThread | null
  threadLoading: boolean
  commentDraft: string
  setCommentDraft: Dispatch<SetStateAction<string>>
  commentSubmitting: boolean
  replyParentId: string | null
  setReplyParentId: Dispatch<SetStateAction<string | null>>
  squads: ReturnType<typeof normalizeAgentSquads>
  selectedSquadId: string
  setSelectedSquadId: Dispatch<SetStateAction<string>>
  mentionOptions: OrchestrationBoardMentionOption[]
  openTask: (task: OrchestrationBoardTask) => void
  closeTask: () => void
  loadThread: (taskId: string) => Promise<void>
  handlePostComment: (parentId?: string | null) => Promise<void>
  handleOpenStageTask: (taskId: string) => Promise<void>
} {
  const consumeOrchestrationBoardFocusTaskId = useAppStore(
    (s) => s.consumeOrchestrationBoardFocusTaskId
  )
  const orchestrationBoardFocusTaskId = useAppStore((s) => s.orchestrationBoardFocusTaskId)
  const agentSquads = useAppStore((s) => s.settings?.agentSquads)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<OrchestrationBoardTask | null>(null)
  const [detailLayout, setDetailLayout] = useState<OrchestrationBoardDetailLayout>('split')
  const [thread, setThread] = useState<OrchestrationBoardTaskThread | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [replyParentId, setReplyParentId] = useState<string | null>(null)
  const [selectedSquadId, setSelectedSquadId] = useState('')

  const squads = useMemo(() => normalizeAgentSquads(agentSquads ?? []), [agentSquads])

  useEffect(() => {
    if (squads.length === 0) {
      setSelectedSquadId('')
      return
    }
    if (!squads.some((squad) => squad.id === selectedSquadId)) {
      setSelectedSquadId(squads[0]!.id)
    }
  }, [squads, selectedSquadId])

  const openTask = useCallback((task: OrchestrationBoardTask) => {
    setSelectedId(task.id)
    setSelectedTask(task)
  }, [])

  const closeTask = useCallback(() => {
    setSelectedId(null)
    setSelectedTask(null)
    setThread(null)
    setCommentDraft('')
    setReplyParentId(null)
  }, [])

  const loadThread = useCallback(async (taskId: string) => {
    setThreadLoading(true)
    try {
      const result = await callRuntimeRpc<OrchestrationBoardTaskThread>(
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
      if (result.task) {
        setSelectedTask(result.task)
        setSelectedId(result.task.id)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setThreadLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setThread(null)
      setCommentDraft('')
      setReplyParentId(null)
      return
    }
    void loadThread(selectedId)
  }, [selectedId, loadThread])

  useEffect(() => {
    const focusId = orchestrationBoardFocusTaskId
    if (!focusId) {
      return
    }
    const local = tasks.find((t) => t.id === focusId)
    if (local) {
      openTask(local)
      setDetailLayout('split')
      consumeOrchestrationBoardFocusTaskId()
      return
    }
    setSelectedId(focusId)
    setSelectedTask(null)
    setDetailLayout('full')
    void loadThread(focusId).finally(() => {
      consumeOrchestrationBoardFocusTaskId()
    })
  }, [
    consumeOrchestrationBoardFocusTaskId,
    loadThread,
    openTask,
    orchestrationBoardFocusTaskId,
    tasks
  ])

  const handlePostComment = useCallback(
    async (parentId?: string | null) => {
      if (!selectedId || !commentDraft.trim()) {
        return
      }
      setCommentSubmitting(true)
      try {
        const result = await callRuntimeRpc<{
          comment: { id: string }
          notified?: { handle: string; injected: boolean; error?: string }[]
          reassigned?: boolean
          warning?: string
        }>(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskCommentAdd',
          {
            task: selectedId,
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
        const failed = (result.notified ?? []).filter((n) => !n.injected)
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
        } else if (failed.length > 0) {
          toast.message(
            translate(
              'auto.components.orchestration.board.comment.postedPartial',
              'Comment posted · notify failed'
            ),
            { description: failed.map((f) => `${f.handle}: ${f.error ?? 'failed'}`).join('; ') }
          )
        } else {
          toast.success(
            translate('auto.components.orchestration.board.comment.posted', 'Comment posted')
          )
        }
        await loadThread(selectedId)
        await load({ showSpinner: false })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setCommentSubmitting(false)
      }
    },
    [commentDraft, load, loadThread, replyParentId, selectedId]
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

  const handleOpenStageTask = useCallback(
    async (taskId: string) => {
      const local = tasks.find((t) => t.id === taskId)
      if (local) {
        openTask(local)
        return
      }
      setSelectedId(taskId)
      setSelectedTask(null)
      await loadThread(taskId)
    },
    [loadThread, openTask, tasks]
  )

  return {
    selectedId,
    activeTask: selectedTask,
    detailLayout,
    setDetailLayout,
    thread,
    threadLoading,
    commentDraft,
    setCommentDraft,
    commentSubmitting,
    replyParentId,
    setReplyParentId,
    squads,
    selectedSquadId,
    setSelectedSquadId,
    mentionOptions,
    openTask,
    closeTask,
    loadThread,
    handlePostComment,
    handleOpenStageTask
  }
}
