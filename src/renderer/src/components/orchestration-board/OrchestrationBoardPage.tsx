import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, LoaderCircle, Plus, RefreshCw, Workflow } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore } from '@/store'
import { useAllWorktrees, useRepoMap } from '@/store/selectors'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree-id'
import { normalizeAgentSquads } from '../../../../shared/agent-squads'
import {
  OrchestrationBoardCreateDialog,
  type OrchestrationBoardCreateDraft,
  type OrchestrationBoardCreateScopeOption
} from './OrchestrationBoardCreateDialog'
import { OrchestrationBoardColumn } from './OrchestrationBoardColumn'
import {
  OrchestrationBoardTaskDialog,
  type OrchestrationBoardDetailLayout,
  type OrchestrationBoardMentionOption
} from './OrchestrationBoardTaskDialog'
import {
  groupTasksByColumn,
  ORCHESTRATION_BOARD_COLUMNS,
  shortWorktreeLabel,
  type OrchestrationBoardComment,
  type OrchestrationBoardInCharge,
  type OrchestrationBoardRosterRow,
  type OrchestrationBoardTask
} from './orchestration-board-model'

type TaskListResult = {
  tasks: OrchestrationBoardTask[]
  count: number
  total?: number
  truncated?: boolean
}

type TaskCreateResult = {
  task: OrchestrationBoardTask
  coalesced?: boolean
}

type TaskAssignSquadResult = {
  task: OrchestrationBoardTask | null
  dispatch: { id: string; status: string } | null
  to: string
  injected: boolean
  spawned: boolean
  squad: { id: string; name: string; routing: string }
}

type TaskThreadResult = {
  task: OrchestrationBoardTask
  comments: OrchestrationBoardComment[]
  roster: OrchestrationBoardRosterRow[]
  inCharge: OrchestrationBoardInCharge
}

const ALL_REPOS = '__all__'
const POLL_MS = 4_000
// Why: orchestration.db lives on the desktop host; remote environments hang forever when offline.
const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }

export default function OrchestrationBoardPage(): React.JSX.Element {
  const closeOrchestrationBoardPage = useAppStore((s) => s.closeOrchestrationBoardPage)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const agentSquads = useAppStore((s) => s.settings?.agentSquads)
  const repoMap = useRepoMap()
  const allWorktrees = useAllWorktrees()

  const defaultRepoFilter = useMemo(() => {
    if (!activeWorktreeId) {
      return ALL_REPOS
    }
    return getRepoIdFromWorktreeId(activeWorktreeId) || ALL_REPOS
  }, [activeWorktreeId])

  const [repoFilter, setRepoFilter] = useState(defaultRepoFilter)
  const [tasks, setTasks] = useState<OrchestrationBoardTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedTask, setSelectedTask] = useState<OrchestrationBoardTask | null>(null)
  const [detailLayout, setDetailLayout] = useState<OrchestrationBoardDetailLayout>('split')
  const [truncated, setTruncated] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null)
  const [selectedSquadId, setSelectedSquadId] = useState<string>('')
  const [productStarting, setProductStarting] = useState(false)
  const [productGoalOpen, setProductGoalOpen] = useState(false)
  const [productGoal, setProductGoal] = useState('')
  const [taskActionId, setTaskActionId] = useState<string | null>(null)
  const [thread, setThread] = useState<TaskThreadResult | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [replyParentId, setReplyParentId] = useState<string | null>(null)
  const loadGenerationRef = React.useRef(0)

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

  // Why: when the active worktree changes, bias the board to that repo once — user can still pick All.
  useEffect(() => {
    setRepoFilter(defaultRepoFilter)
  }, [defaultRepoFilter])

  const load = useCallback(async (opts?: { showSpinner?: boolean }) => {
    const generation = ++loadGenerationRef.current
    if (opts?.showSpinner) {
      setLoading(true)
    }
    try {
      // Always local: task queue is desktop control-plane state, not remote runtime state.
      const result = await callRuntimeRpc<TaskListResult>(
        LOCAL_RUNTIME_TARGET,
        'orchestration.taskList',
        {
          ...(repoFilter !== ALL_REPOS ? { repoId: repoFilter } : {})
        },
        { timeoutMs: 15_000, skipCompatibilityCheck: true }
      )
      if (generation !== loadGenerationRef.current) {
        return
      }
      const nextTasks = result.tasks ?? []
      setTasks(nextTasks)
      setTruncated(result.truncated === true)
      setError(null)
      // Keep open detail in sync with board poll without clearing selection.
      if (selectedId) {
        const fresh = nextTasks.find((t) => t.id === selectedId)
        if (fresh) {
          setSelectedTask(fresh)
        }
      }
    } catch (err) {
      if (generation !== loadGenerationRef.current) {
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false)
      }
    }
  }, [repoFilter, selectedId])

  useEffect(() => {
    void load({ showSpinner: true })
    return installWindowVisibilityInterval({
      run: () => {
        // Why: background poll must not flip the header spinner; that made the board look stuck.
        void load({ showSpinner: false })
      },
      intervalMs: POLL_MS
    })
  }, [load])

  const columns = useMemo(() => groupTasksByColumn(tasks), [tasks])

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

  const scopeOptions = useMemo((): OrchestrationBoardCreateScopeOption[] => {
    return allWorktrees
      .map((worktree) => {
        const repo = repoMap.get(worktree.repoId)
        return {
          worktreeId: worktree.id,
          repoId: worktree.repoId,
          repoLabel: repo?.displayName ?? worktree.repoId,
          worktreeLabel:
            worktree.displayName?.trim() || shortWorktreeLabel(worktree.id) || worktree.id
        }
      })
      .sort((a, b) => {
        const repoCmp = a.repoLabel.localeCompare(b.repoLabel)
        return repoCmp !== 0 ? repoCmp : a.worktreeLabel.localeCompare(b.worktreeLabel)
      })
  }, [allWorktrees, repoMap])

  const createDefaultWorktreeId = useMemo(() => {
    if (activeWorktreeId && scopeOptions.some((option) => option.worktreeId === activeWorktreeId)) {
      return activeWorktreeId
    }
    if (repoFilter !== ALL_REPOS) {
      return scopeOptions.find((option) => option.repoId === repoFilter)?.worktreeId ?? null
    }
    return null
  }, [activeWorktreeId, repoFilter, scopeOptions])

  const repoOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const task of tasks) {
      if (task.repo_id) {
        ids.add(task.repo_id)
      }
    }
    for (const option of scopeOptions) {
      ids.add(option.repoId)
    }
    if (repoFilter !== ALL_REPOS) {
      ids.add(repoFilter)
    }
    return [...ids].sort()
  }, [tasks, repoFilter, scopeOptions])

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
      setAssigningTaskId(task.id)
      try {
        // Why: pending tasks with deps aren't dispatchable; promote-ready is automatic when deps complete.
        if (task.status === 'pending') {
          throw new Error(
            'Task is pending dependencies. Wait until it is ready, or remove deps before assigning.'
          )
        }
        const result = await callRuntimeRpc<TaskAssignSquadResult>(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskAssignSquad',
          {
            task: task.id,
            squad: selectedSquadId,
            inject: true,
            spawnIfMissing: true,
            // Why: board UX shouldn't hang for the full 90s agent boot; fail with a clear toast sooner.
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
      } finally {
        setAssigningTaskId(null)
      }
    },
    [load, openTask, selectedSquadId]
  )

  const loadThread = useCallback(async (taskId: string) => {
    setThreadLoading(true)
    try {
      const result = await callRuntimeRpc<TaskThreadResult>(
        LOCAL_RUNTIME_TARGET,
        'orchestration.taskThread',
        { task: taskId },
        { timeoutMs: 15_000, skipCompatibilityCheck: true }
      )
      setThread(result)
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

  const handlePostComment = useCallback(
    async (parentId?: string | null) => {
      if (!selectedId || !commentDraft.trim()) {
        return
      }
      setCommentSubmitting(true)
      try {
        const result = await callRuntimeRpc<{
          comment: { id: string }
          notified?: Array<{ handle: string; injected: boolean; error?: string }>
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

  const handleRetryTask = useCallback(
    async (task: OrchestrationBoardTask) => {
      setTaskActionId(task.id)
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
          openTask(result.task)
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
      } finally {
        setTaskActionId(null)
      }
    },
    [load, loadThread, openTask, selectedSquadId]
  )

  const handleStopTask = useCallback(
    async (task: OrchestrationBoardTask) => {
      setTaskActionId(task.id)
      try {
        await callRuntimeRpc(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskStop',
          {
            id: task.id,
            reason: 'Stopped from orchestration board'
          },
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
      } finally {
        setTaskActionId(null)
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
      setTaskActionId(task.id)
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
      } finally {
        setTaskActionId(null)
      }
    },
    [closeTask, load]
  )

  const handleStartProduct = useCallback(async () => {
    // Why: window.prompt() is not supported in Electron — open custom dialog instead.
    setProductGoal('')
    setProductGoalOpen(true)
  }, [])

  const handleStartProductSubmit = useCallback(async (goal: string) => {
    if (!goal.trim()) { return }
    setProductGoalOpen(false)
    const repoId =
      repoFilter !== ALL_REPOS
        ? repoFilter
        : activeWorktreeId
          ? getRepoIdFromWorktreeId(activeWorktreeId)
          : null
    if (!repoId) {
      toast.error(
        translate(
          'auto.components.orchestration.board.product.needRepo',
          'Select a repo filter (or open a worktree) before starting a product pipeline.'
        )
      )
      return
    }
    setProductStarting(true)
    try {
      const result = await callRuntimeRpc<{
        pipelineId: string
        worktreeId: string | null
        worktreeCreated: boolean
        issueNumber: number | null
        dispatches: Array<{ role: string; to: string; spawned: boolean }>
      }>(
        LOCAL_RUNTIME_TARGET,
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
      toast.success(
        translate(
          'auto.components.orchestration.board.product.started',
          'Pipeline {id} — {n} role(s) dispatched',
          { id: result.pipelineId, n: result.dispatches.length }
        )
      )
      if (result.worktreeId) {
        setRepoFilter(getRepoIdFromWorktreeId(result.worktreeId) || repoId)
      }
      await load({ showSpinner: false })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setProductStarting(false)
    }
  }, [activeWorktreeId, load, repoFilter])

  const handleCreate = useCallback(
    async (draft: OrchestrationBoardCreateDraft) => {
      setCreateSubmitting(true)
      setCreateError(null)
      try {
        const result = await callRuntimeRpc<TaskCreateResult>(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskCreate',
          {
            spec: draft.spec,
            ...(draft.title
              ? { taskTitle: draft.title, displayName: draft.title }
              : {}),
            priority: draft.priority,
            ...(draft.repoId ? { repoId: draft.repoId } : {}),
            ...(draft.worktreeId ? { worktreeId: draft.worktreeId } : {}),
            hostId: 'local'
          },
          { timeoutMs: 15_000, skipCompatibilityCheck: true }
        )
        setCreateOpen(false)
        toast.success(
          translate('auto.components.orchestration.board.create.success', 'Created {id}', {
            id: result.task.id
          })
        )
        // Why: jump filter to the new task's repo so it appears immediately when a repo filter was active.
        if (result.task.repo_id) {
          setRepoFilter(result.task.repo_id)
        }
        await load({ showSpinner: false })
        openTask(result.task)
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : String(err))
      } finally {
        setCreateSubmitting(false)
      }
    },
    [load, openTask]
  )

  const activeTask = selectedTask
  const showDetail = Boolean(selectedId && activeTask)
  const showBoard = !showDetail || detailLayout === 'split' || detailLayout === 'modal'
  const showMainDetail = showDetail && (detailLayout === 'split' || detailLayout === 'full')
  const showModalDetail = showDetail && detailLayout === 'modal'

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2"
          onClick={() => closeOrchestrationBoardPage()}
        >
          <ArrowLeft className="size-4" />
          {translate('auto.components.orchestration.board.back', 'Back')}
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Workflow className="size-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-sm font-semibold tracking-tight">
            {translate('auto.components.orchestration.board.title', 'Orchestration Board')}
          </h1>
          <span className="text-xs text-muted-foreground tabular-nums">
            {tasks.length}
            {truncated ? '+' : ''}
          </span>
        </div>
        <Select value={repoFilter} onValueChange={setRepoFilter}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue
              placeholder={translate('auto.components.orchestration.board.repoFilter', 'Repo')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_REPOS}>
              {translate('auto.components.orchestration.board.allRepos', 'All repos')}
            </SelectItem>
            {repoOptions.map((repoId) => (
              <SelectItem key={repoId} value={repoId}>
                {repoMap.get(repoId)?.displayName ?? repoId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectedSquadId || undefined}
          onValueChange={setSelectedSquadId}
          disabled={squads.length === 0}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue
              placeholder={translate(
                'auto.components.orchestration.board.squadFilter',
                squads.length === 0 ? 'No squads' : 'Squad'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {squads.map((squad) => (
              <SelectItem key={squad.id} value={squad.id}>
                {squad.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => {
            void load({ showSpinner: true })
          }}
        >
          {loading ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {translate('auto.components.orchestration.board.refresh', 'Refresh')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 gap-1.5"
          disabled={productStarting}
          onClick={() => {
            void handleStartProduct()
          }}
        >
          {productStarting ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Workflow className="size-3.5" />
          )}
          {translate('auto.components.orchestration.board.startProduct', 'Start product')}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => {
            setCreateError(null)
            setCreateOpen(true)
          }}
        >
          <Plus className="size-3.5" />
          {translate('auto.components.orchestration.board.newTask', 'New task')}
        </Button>
      </header>

      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {showBoard ? (
          <div
            className={
              showMainDetail
                ? 'flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto p-4 scrollbar-sleek'
                : 'flex min-h-0 min-w-0 flex-1 gap-3 overflow-x-auto p-4 scrollbar-sleek'
            }
          >
            {ORCHESTRATION_BOARD_COLUMNS.map((column) => (
              <OrchestrationBoardColumn
                key={column.id}
                id={column.id}
                title={column.title}
                tasks={columns[column.id]}
                onSelectTask={openTask}
              />
            ))}
          </div>
        ) : null}

        {showMainDetail && activeTask ? (
          <div
            className={
              detailLayout === 'full'
                ? 'min-h-0 min-w-0 flex-1'
                : 'min-h-0 w-full max-w-[min(720px,52vw)] shrink-0 xl:max-w-[760px]'
            }
          >
            <OrchestrationBoardTaskDialog
              task={activeTask}
              thread={thread}
              threadLoading={threadLoading}
              commentDraft={commentDraft}
              commentSubmitting={commentSubmitting}
              selectedSquadId={selectedSquadId}
              squadsEmpty={squads.length === 0}
              assigning={assigningTaskId === activeTask.id}
              actionBusy={taskActionId === activeTask.id}
              repoLabel={
                activeTask.repo_id
                  ? (repoMap.get(activeTask.repo_id)?.displayName ?? activeTask.repo_id)
                  : null
              }
              mentionOptions={mentionOptions}
              layout={detailLayout === 'full' ? 'full' : 'split'}
              onLayoutChange={setDetailLayout}
              onClose={closeTask}
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
                void handleAssignSquad(activeTask)
              }}
              onRetry={() => {
                void handleRetryTask(activeTask)
              }}
              onStop={() => {
                void handleStopTask(activeTask)
              }}
              onDelete={() => {
                void handleDeleteTask(activeTask)
              }}
              onOpenStageTask={(taskId) => {
                void handleOpenStageTask(taskId)
              }}
            />
          </div>
        ) : null}
      </div>

      {/* Product goal dialog — replaces window.prompt() which is blocked in Electron */}
      <Dialog open={productGoalOpen} onOpenChange={setProductGoalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {translate('auto.components.orchestration.board.product.dialogTitle', 'Start Product Pipeline')}
            </DialogTitle>
            <DialogDescription>
              {translate(
                'auto.components.orchestration.board.product.dialogDesc',
                'Orca will create a worktree and run a research → implement → test → review loop.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="product-goal">
              {translate('auto.components.orchestration.board.product.goalLabel', 'Product goal')}
            </Label>
            <Input
              id="product-goal"
              autoFocus
              placeholder={translate(
                'auto.components.orchestration.board.product.goalPlaceholder',
                'e.g. Add JWT authentication to the API'
              )}
              value={productGoal}
              onChange={(e) => setProductGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && productGoal.trim()) {
                  void handleStartProductSubmit(productGoal)
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProductGoalOpen(false)}>
              {translate('auto.components.orchestration.board.product.cancel', 'Cancel')}
            </Button>
            <Button
              disabled={!productGoal.trim() || productStarting}
              onClick={() => void handleStartProductSubmit(productGoal)}
            >
              {productStarting ? (
                <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {translate('auto.components.orchestration.board.product.submit', 'Start pipeline')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <OrchestrationBoardTaskDialog
          task={activeTask}
          thread={thread}
          threadLoading={threadLoading}
          commentDraft={commentDraft}
          commentSubmitting={commentSubmitting}
          selectedSquadId={selectedSquadId}
          squadsEmpty={squads.length === 0}
          assigning={assigningTaskId === activeTask.id}
          actionBusy={taskActionId === activeTask.id}
          repoLabel={
            activeTask.repo_id
              ? (repoMap.get(activeTask.repo_id)?.displayName ?? activeTask.repo_id)
              : null
          }
          mentionOptions={mentionOptions}
          layout="modal"
          onLayoutChange={setDetailLayout}
          onClose={closeTask}
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
            void handleAssignSquad(activeTask)
          }}
          onRetry={() => {
            void handleRetryTask(activeTask)
          }}
          onStop={() => {
            void handleStopTask(activeTask)
          }}
          onDelete={() => {
            void handleDeleteTask(activeTask)
          }}
          onOpenStageTask={(taskId) => {
            void handleOpenStageTask(taskId)
          }}
        />
      ) : null}
    </div>
  )
}
