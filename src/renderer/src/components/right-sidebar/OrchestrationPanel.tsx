/**
 * Right-sidebar orchestration queue for the active project/repo.
 * Scoped list only — full board lives in the main Orchestration Board view.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, ExternalLink, LoaderCircle, RefreshCw, Workflow } from 'lucide-react'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import {
  taskBoardLabel,
  type OrchestrationBoardTask
} from '@/components/orchestration-board/orchestration-board-model'
import { OrchestrationTaskDetailHost } from '@/components/orchestration-board/OrchestrationTaskDetailHost'
import {
  collectRunningAgentsByTaskId,
  summarizeRunningAgents
} from '@/components/orchestration-board/orchestration-task-running-agents'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }
const POLL_MS = 5_000

const STATUS_TONE: Record<string, string> = {
  ready: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  pending: 'border-border bg-muted/40 text-muted-foreground',
  dispatched: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
  blocked: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300'
}

type TaskListResult = {
  tasks: OrchestrationBoardTask[]
  count: number
  truncated?: boolean
}

function StatusChip({ status }: { status: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-semibold capitalize',
        STATUS_TONE[status] ?? STATUS_TONE.pending
      )}
    >
      {status}
    </span>
  )
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
        const nextTasks = result.tasks ?? []
        setTasks(nextTasks)
        setError(null)
        if (selectedTask) {
          const fresh = nextTasks.find((t) => t.id === selectedTask.id)
          if (fresh) {
            setSelectedTask(fresh)
          }
        }
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
    [repoId, scope, selectedTask, worktreeId]
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

  const runningByTaskId = useMemo(
    () =>
      collectRunningAgentsByTaskId({
        tasks,
        agentStatusByPaneKey,
        runtimeAgentOrchestrationByPaneKey
      }),
    [agentStatusByPaneKey, runtimeAgentOrchestrationByPaneKey, tasks]
  )
  const totalWorkingAgents = useMemo(() => {
    let n = 0
    for (const agents of Object.values(runningByTaskId)) {
      n += agents.filter((a) => a.state === 'working').length
    }
    return n
  }, [runningByTaskId])

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
            <button
              key={task.id}
              type="button"
              className={cn(
                'flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-accent',
                selectedTask?.id === task.id && 'bg-accent'
              )}
              onClick={() => {
                const targetWorktreeId = task.worktree_id || worktreeId
                // Why: dock into project main-box; fall back to local drawer if action is unavailable.
                if (targetWorktreeId && openOrchestrationTaskDetails) {
                  try {
                    openOrchestrationTaskDetails(targetWorktreeId, { task })
                    setSelectedTask(null)
                    return
                  } catch (err) {
                    console.error('[OrchestrationPanel] openOrchestrationTaskDetails failed', err)
                  }
                }
                setSelectedTask(task)
              }}
            >
              <div className="flex items-center gap-2">
                <StatusChip status={task.status} />
                {task.pipeline_role ? (
                  <span className="text-[10px] capitalize text-muted-foreground">
                    {task.pipeline_role}
                  </span>
                ) : null}
                {task.priority && task.priority !== 'medium' ? (
                  <span className="text-[10px] capitalize text-muted-foreground">
                    {task.priority}
                  </span>
                ) : null}
                {(() => {
                  const agents = runningByTaskId[task.id] ?? []
                  const summary = summarizeRunningAgents(agents)
                  if (summary.total === 0) {
                    return null
                  }
                  return (
                    <span
                      className={cn(
                        'ml-auto inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                        summary.workingCount > 0
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                      )}
                      title={agents
                        .map(
                          (a) =>
                            `${a.agentType}${a.model ? ` (${a.model})` : ''} · ${a.state}`
                        )
                        .join('\n')}
                    >
                      <Bot className="size-3" />
                      {summary.workingCount > 0
                        ? `${summary.workingCount} working`
                        : `${summary.total} live`}
                      <span className="opacity-80">
                        {summary.agentTypes.slice(0, 2).join(' · ')}
                      </span>
                    </span>
                  )
                })()}
              </div>
              <div className="line-clamp-2 text-[12px] leading-snug text-foreground">
                {taskBoardLabel(task)}
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                <span className="truncate">{task.id}</span>
                {task.assignee_handle ? (
                  <span className="ml-auto truncate">{task.assignee_handle}</span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedTask ? (
        <OrchestrationTaskDetailHost
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onChanged={() => {
            void load({ showSpinner: false })
          }}
        />
      ) : null}
    </div>
  )
}
