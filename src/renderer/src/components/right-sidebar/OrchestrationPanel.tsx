/**
 * Right-sidebar orchestration queue for the active project/repo.
 * Scoped list only — task detail docks into the project main tab strip.
 */
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, LoaderCircle, RefreshCw, Workflow } from 'lucide-react'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import type { OrchestrationBoardTask } from '@/components/orchestration-board/orchestration-board-model'
import { collectRunningAgentsByTaskId } from '@/components/orchestration-board/orchestration-task-running-agents'
import { OrchestrationPanelTaskRow } from './orchestration-panel-task-row'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }
const POLL_MS = 5_000

// Why: keep list panel mountable even if detail host chunk fails to load.
const OrchestrationTaskDetailHost = React.lazy(async () => {
  const mod = await import('@/components/orchestration-board/OrchestrationTaskDetailHost')
  return { default: mod.OrchestrationTaskDetailHost }
})

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
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const runtimeAgentOrchestrationByPaneKey = useAppStore(
    (s) => s.runtimeAgentOrchestrationByPaneKey
  )

  const repoId = activeRepo?.id ?? activeWorktree?.repoId ?? null
  const worktreeId = activeWorktree?.id ?? null
  const projectLabel = activeRepo?.displayName || activeRepo?.path || repoId || 'Project'

  const [tasks, setTasks] = useState<OrchestrationBoardTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<'repo' | 'worktree'>('repo')
  const [selectedTask, setSelectedTask] = useState<OrchestrationBoardTask | null>(null)
  const loadGenRef = React.useRef(0)

  const load = useCallback(
    async (opts?: { showSpinner?: boolean }) => {
      if (!repoId && !worktreeId) {
        setTasks([])
        setError(null)
        setLoading(false)
        return
      }
      const generation = ++loadGenRef.current
      if (opts?.showSpinner) {
        setLoading(true)
      }
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
        if (generation !== loadGenRef.current) {
          return
        }
        setTasks(result.tasks ?? [])
        setError(null)
      } catch (err) {
        if (generation !== loadGenRef.current) {
          return
        }
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (generation === loadGenRef.current) {
          setLoading(false)
        }
      }
    },
    [repoId, scope, worktreeId]
  )

  useEffect(() => {
    if (!isVisible) {
      return
    }
    void load({ showSpinner: true })
    return installWindowVisibilityInterval({
      run: () => {
        void load({ showSpinner: false })
      },
      intervalMs: POLL_MS
    })
  }, [isVisible, load])

  // Keep selected drawer task fresh after poll without putting selectedTask in load deps.
  useEffect(() => {
    if (!selectedTask) {
      return
    }
    const fresh = tasks.find((t) => t.id === selectedTask.id)
    if (fresh && fresh !== selectedTask) {
      setSelectedTask(fresh)
    }
  }, [selectedTask, tasks])

  const sorted = useMemo(() => {
    const rank = (status: string): number => {
      switch (status) {
        case 'dispatched':
          return 0
        case 'ready':
        case 'pending':
          return 1
        case 'blocked':
          return 2
        case 'failed':
          return 3
        case 'completed':
          return 4
        default:
          return 5
      }
    }
    return [...tasks].sort((a, b) => rank(a.status) - rank(b.status))
  }, [tasks])

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
      // Why: store maps can be undefined during early hydration / slice swaps.
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

  const openTaskFromList = useCallback(
    (task: OrchestrationBoardTask) => {
      const targetWorktreeId = task.worktree_id || worktreeId
      if (targetWorktreeId && openOrchestrationTaskDetails) {
        try {
          // Align left-sidebar project + File Explorer with the task worktree being viewed.
          if (targetWorktreeId !== worktreeId) {
            setActiveWorktree?.(targetWorktreeId)
          }
          openOrchestrationTaskDetails(targetWorktreeId, { task })
          setSelectedTask(null)
          return
        } catch (err) {
          console.error('[OrchestrationPanel] open main task tab failed', err)
        }
      }
      setSelectedTask(task)
    },
    [openOrchestrationTaskDetails, setActiveWorktree, worktreeId]
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
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title={translate('auto.components.right.sidebar.orchestration.refresh', 'Refresh')}
          onClick={() => {
            void load({ showSpinner: true })
          }}
        >
          {loading ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          title={translate(
            'auto.components.right.sidebar.orchestration.openBoard',
            'Open full board'
          )}
          onClick={() => openOrchestrationBoardPage()}
        >
          <ExternalLink className="size-3.5" />
        </Button>
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

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        {loading && sorted.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-3 py-10 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            {translate('auto.components.right.sidebar.orchestration.loading', 'Loading tasks…')}
          </div>
        ) : null}
        {!loading && sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.right.sidebar.orchestration.empty',
                'No orchestration tasks for this project yet.'
              )}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => openOrchestrationBoardPage()}
            >
              {translate(
                'auto.components.right.sidebar.orchestration.openBoardCta',
                'Open board'
              )}
            </Button>
          </div>
        ) : null}
        <div className="divide-y divide-border/40">
          {sorted.map((task) => (
            <OrchestrationPanelTaskRow
              key={task.id}
              task={task}
              selected={selectedTask?.id === task.id}
              agents={runningByTaskId[task.id] ?? []}
              onClick={() => openTaskFromList(task)}
            />
          ))}
        </div>
      </div>

      {selectedTask ? (
        <Suspense fallback={null}>
          <OrchestrationTaskDetailHost
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onChanged={() => {
              void load({ showSpinner: false })
            }}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
