import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, LoaderCircle, PlayCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { OrchestrationBoardTask } from './orchestration-board-model'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }
const POLL_MS = 3_000

export function OrchestrationPlanRunning({
  pipelineId,
  onDone
}: {
  pipelineId: string
  onDone: (tasks: OrchestrationBoardTask[]) => void
}): React.JSX.Element {
  const [subtasks, setSubtasks] = useState<OrchestrationBoardTask[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const poll = async (): Promise<void> => {
      if (cancelled) {
        return
      }
      try {
        const result = await callRuntimeRpc<{
          tasks: OrchestrationBoardTask[]
        }>(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskList',
          { parent: pipelineId },
          { timeoutMs: 15_000, skipCompatibilityCheck: true }
        )
        if (cancelled) {
          return
        }
        const tasks = result.tasks ?? []
        setSubtasks(tasks)
        setError(null)
        const done =
          tasks.length > 0 && tasks.every((t) => t.status === 'completed' || t.status === 'failed')
        if (done) {
          onDone(tasks)
          return
        }
      } catch {
        // transient — keep polling
      }
      timer = setTimeout(() => void poll(), POLL_MS)
    }
    void poll()
    return () => {
      cancelled = true
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [onDone, pipelineId])

  const activeCount = subtasks.filter(
    (t) => t.status !== 'completed' && t.status !== 'failed'
  ).length
  const doneCount = subtasks.filter((t) => t.status === 'completed').length

  return (
    <div className="flex max-h-[50vh] flex-col gap-2 py-2">
      <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <LoaderCircle className="size-3 animate-spin" />
          {translate('auto.components.orchestration.board.running.active', '{n} active', {
            n: activeCount
          })}
        </span>
        <span>·</span>
        <span className="text-emerald-600 dark:text-emerald-400">{doneCount} done</span>
        {subtasks.length > 0 ? <span>· {subtasks.length} total</span> : null}
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto scrollbar-sleek">
        {subtasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5"
          >
            <TaskStatusIcon status={task.status} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px]">
                {task.display_name || task.task_title || task.spec || task.id}
              </div>
              {task.pipeline_role ? (
                <div className="text-[10px] capitalize text-muted-foreground">
                  {task.pipeline_role}
                </div>
              ) : null}
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] capitalize',
                task.status === 'completed'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                  : task.status === 'failed'
                    ? 'bg-destructive/15 text-destructive'
                    : task.status === 'dispatched'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      : 'bg-muted text-muted-foreground'
              )}
            >
              {task.status}
            </span>
          </div>
        ))}
        {subtasks.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {translate(
              'auto.components.orchestration.board.running.waiting',
              'Waiting for the pipeline to create subtasks…'
            )}
          </p>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function TaskStatusIcon({ status }: { status: string }): React.JSX.Element {
  if (status === 'completed') {
    return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
  }
  if (status === 'dispatched' || status === 'ready' || status === 'pending') {
    return <PlayCircle className="size-4 shrink-0 text-amber-500" />
  }
  if (status === 'failed') {
    return <Circle className="size-4 shrink-0 text-destructive" />
  }
  return <Circle className="size-4 shrink-0 text-muted-foreground/40" />
}
