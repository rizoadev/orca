/**
 * Right-sidebar orchestration companion for the active project/repo.
 * The dense three-view workspace lives in the full board (main box); this
 * panel keeps a compact live summary and hands off to that board.
 */
import { toast } from 'sonner'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, LoaderCircle, Plus, RefreshCw, Workflow } from 'lucide-react'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { OrchestrationBoardCreateDialog } from '../orchestration-board/OrchestrationBoardCreateDialog'
import { OrchestrationProductGoalDialog } from '../orchestration-board/OrchestrationProductGoalDialog'
import { useOrchestrationProductPlan } from '../orchestration-board/use-orchestration-product-plan'
import { shortWorktreeLabel, type OrchestrationBoardTask } from '../orchestration-board/orchestration-board-model'
import { collectRunningAgentsByTaskId } from '../orchestration-board/orchestration-task-running-agents'
import { normalizeAgentSquads } from '../../../../shared/agent-squads'
import type { AgentSquad } from '../../../../shared/agent-squads'
import type { SubTaskBreakdownItem } from '../../../../shared/subtask-breakdown'
import { OrchestrationSidebarTaskTree } from './OrchestrationSidebarTaskTree'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }
const POLL_MS = 5_000

type TaskListResult = {
  tasks: OrchestrationBoardTask[]
  count: number
  truncated?: boolean
}

export default function OrchestrationPanel({
  isVisible
}: {
  isVisible: boolean
}): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const openOrchestrationBoardPage = useAppStore((s) => s.openOrchestrationBoardPage)
  const openOrchestrationTaskDetails = useAppStore((s) => s.openOrchestrationTaskDetails)
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const runtimeAgentOrchestrationByPaneKey = useAppStore(
    (s) => s.runtimeAgentOrchestrationByPaneKey
  )
  const agentSquads = useAppStore((s) => s.settings?.agentSquads)

  const repoId = activeRepo?.id ?? activeWorktree?.repoId ?? null
  const worktreeId = activeWorktree?.id ?? null
  const projectLabel = activeRepo?.displayName || activeRepo?.path || repoId || 'Project'

  const [tasks, setTasks] = useState<OrchestrationBoardTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'repo' | 'worktree'>('repo')
  const [createOpen, setCreateOpen] = useState(false)
  const [productGoalOpen, setProductGoalOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const plan = useOrchestrationProductPlan()
  const squads: AgentSquad[] = useMemo(() => normalizeAgentSquads(agentSquads ?? []), [agentSquads])

  const scopeOptions = useMemo(() => {
    if (!activeRepo || !activeWorktree) {
      return []
    }
    return [
      {
        worktreeId: activeWorktree.id,
        repoId: activeRepo.id,
        repoLabel: activeRepo.displayName || activeRepo.path || activeRepo.id || 'Repo',
        worktreeLabel:
          activeWorktree.displayName?.trim() || shortWorktreeLabel(activeWorktree.id) || activeWorktree.id
      }
    ]
  }, [activeRepo, activeWorktree])

  const load = useCallback(async () => {
    if (!repoId && !worktreeId) {
      setTasks([])
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const listParams =
        scope === 'worktree' && worktreeId
          ? { worktreeId }
          : repoId
            ? { repoId }
            : worktreeId
              ? { worktreeId }
              : {}
      const result = await callRuntimeRpc<TaskListResult>(
        LOCAL_RUNTIME_TARGET,
        'orchestration.taskList',
        listParams,
        { timeoutMs: 15_000, skipCompatibilityCheck: true }
      )
      setTasks(result.tasks ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [repoId, scope, worktreeId])

  useEffect(() => {
    if (!isVisible) {
      return
    }
    void load()
    return installWindowVisibilityInterval({
      run: () => {
        void load()
      },
      intervalMs: POLL_MS
    })
  }, [isVisible, load])

  const counts = useMemo(() => {
    let active = 0
    let done = 0
    let failed = 0
    for (const t of tasks) {
      if (t.status === 'completed') {
        done += 1
      } else if (t.status === 'failed') {
        failed += 1
      } else {
        active += 1
      }
    }
    return { active, done, failed }
  }, [tasks])

  const runningByTaskId = useMemo(() => {
    try {
      return collectRunningAgentsByTaskId({
        tasks: Array.isArray(tasks) ? tasks : [],
        agentStatusByPaneKey: agentStatusByPaneKey ?? {},
        runtimeAgentOrchestrationByPaneKey: runtimeAgentOrchestrationByPaneKey ?? {}
      })
    } catch (err) {
      console.error('[OrchestrationPanel] running-agent projection failed', err)
      return {}
    }
  }, [agentStatusByPaneKey, runtimeAgentOrchestrationByPaneKey, tasks])

  const totalWorkingAgents = useMemo(() => {
    let n = 0
    for (const agents of Object.values(runningByTaskId)) {
      n += agents.filter((a) => a.state === 'working').length
    }
    return n
  }, [runningByTaskId])

  const openBoard = useCallback(() => {
    openOrchestrationBoardPage()
  }, [openOrchestrationBoardPage])

  const handleCreate = useCallback(
    async (draft: {
      spec: string
      title?: string
      priority?: string
      repoId?: string | null
      worktreeId?: string | null
      squadId?: string | null
    }) => {
      setCreateSubmitting(true)
      setCreateError(null)
      try {
        const created = await callRuntimeRpc<
          {
            task: {
              id: string
              status: string
              repo_id?: string | null
              worktree_id?: string | null
            } & Record<string, unknown>
          }
        >(
          LOCAL_RUNTIME_TARGET,
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

        if (draft.squadId && created?.task?.id) {
          try {
            await callRuntimeRpc(
              LOCAL_RUNTIME_TARGET,
              'orchestration.taskAssignSquad',
              {
                task: created.task.id,
                squad: draft.squadId,
                inject: true,
                spawnIfMissing: true,
                waitTimeoutMs: 45_000
              },
              { timeoutMs: 60_000, skipCompatibilityCheck: true }
            )
          } catch (assignErr) {
            toast.error(
              assignErr instanceof Error ? assignErr.message : String(assignErr)
            )
          }
        }

        setCreateOpen(false)
        await load()
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : String(err))
      } finally {
        setCreateSubmitting(false)
      }
    },
    [load]
  )

  const handleStartPlan = useCallback(
    async (goal: string, squadId: string | null) => {
      if (!repoId) {
        throw new Error('Open a project worktree first.')
      }
      return plan.startPlan(goal, squadId, repoId)
    },
    [plan, repoId]
  )

  const handleCreatePlan = useCallback(
    async (items: SubTaskBreakdownItem[], pipelineId: string) => {
      await plan.createPlan(items, pipelineId, repoId)
      await load()
    },
    [load, plan, repoId]
  )

  // Why: clicking a task defaults to docking its detail into the main box next
  // to the terminal (the right sidebar stays put), instead of jumping to the
  // full board. "Open board" remains for the dense three-view workspace.
  const openTaskInMainBox = useCallback(
    (task: OrchestrationBoardTask) => {
      const targetWorktree = task.worktree_id || worktreeId
      if (!targetWorktree) {
        openBoard()
        return
      }
      openOrchestrationTaskDetails(targetWorktree, { task })
    },
    [openBoard, openOrchestrationTaskDetails, worktreeId]
  )

  if (!repoId && !worktreeId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-muted-foreground">
        <Workflow className="size-5 opacity-50" />
        {translate(
          'auto.components.right.sidebar.orchestration.noProject',
          'Open a project worktree to see orchestration tasks.'
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Workflow className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">
            {translate('auto.components.right.sidebar.orchestration.title', 'Orchestration')}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">{projectLabel}</div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setCreateError(null)
                setCreateOpen(true)
              }}
            >
              <Plus className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.right.sidebar.orchestration.newTask', 'New task')}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setProductGoalOpen(true)}
            >
              <Workflow className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.right.sidebar.orchestration.newGoal', 'New product goal')}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title={translate('auto.components.right.sidebar.orchestration.refresh', 'Refresh')}
              onClick={() => {
                void load()
              }}
            >
              {loading ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.right.sidebar.orchestration.refresh', 'Refresh')}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              title={translate(
                'auto.components.right.sidebar.orchestration.openBoard',
                'Open full board'
              )}
              onClick={openBoard}
            >
              <ExternalLink className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.right.sidebar.orchestration.openBoard', 'Open full board')}
          </TooltipContent>
        </Tooltip>
      </header>

      <div className="flex shrink-0 items-center gap-1 border-b border-border/40 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setScope('repo')}
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium',
            scope === 'repo'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-accent'
          )}
        >
          {translate('auto.components.right.sidebar.orchestration.scopeRepo', 'Repo')}
        </button>
        <button
          type="button"
          onClick={() => setScope('worktree')}
          disabled={!worktreeId}
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium',
            scope === 'worktree'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-accent',
            !worktreeId && 'opacity-40'
          )}
        >
          {translate('auto.components.right.sidebar.orchestration.scopeWorktree', 'Worktree')}
        </button>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground">
          {totalWorkingAgents > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              {totalWorkingAgents} AI
            </span>
          ) : null}
          {counts.active} active
          {counts.failed ? ` · ${counts.failed} failed` : ''}
          {counts.done ? ` · ${counts.done} done` : ''}
        </span>
      </div>

      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-sleek">
        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            {translate('auto.components.right.sidebar.orchestration.loading', 'Loading…')}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.right.sidebar.orchestration.empty',
                'No orchestration tasks yet.'
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => {
                  setCreateError(null)
                  setCreateOpen(true)
                }}
              >
                {translate('auto.components.right.sidebar.orchestration.newTask', 'New task')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setProductGoalOpen(true)}
              >
                {translate('auto.components.right.sidebar.orchestration.newGoal', 'New product goal')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <OrchestrationSidebarTaskTree tasks={tasks} onOpenTask={openTaskInMainBox} />
            {tasks.length > 30 ? (
              <button
                type="button"
                onClick={openBoard}
                className="w-full px-2 py-1 text-center text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {translate(
                  'auto.components.right.sidebar.orchestration.more',
                  '{n} more — open board',
                  { n: tasks.length - 30 }
                )}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <OrchestrationBoardCreateDialog
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next)
          if (!next) {
            setCreateError(null)
          }
        }}
        scopeOptions={scopeOptions}
        defaultRepoId={repoId}
        defaultWorktreeId={worktreeId}
        squads={squads.map((squad) => ({ id: squad.id, name: squad.name }))}
        defaultSquadId={null}
        submitting={createSubmitting}
        error={createError}
        onSubmit={handleCreate}
      />

      <OrchestrationProductGoalDialog
        open={productGoalOpen}
        onOpenChange={setProductGoalOpen}
        starting={false}
        squads={squads}
        onStartPlan={handleStartPlan}
        onCreatePlan={handleCreatePlan}
      />
    </div>
  )
}
