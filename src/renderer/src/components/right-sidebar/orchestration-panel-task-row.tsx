import React from 'react'
import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { taskBoardLabel, type OrchestrationBoardTask } from '@/components/orchestration-board/orchestration-board-model'
import { summarizeRunningAgents, type OrchestrationTaskRunningAgent } from '@/components/orchestration-board/orchestration-task-running-agents'

const STATUS_TONE: Record<string, string> = {
  ready: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  pending: 'border-border bg-muted/40 text-muted-foreground',
  dispatched: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
  blocked: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300'
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

export function OrchestrationPanelTaskRow({
  task,
  selected,
  agents,
  onClick
}: {
  task: OrchestrationBoardTask
  selected: boolean
  agents: OrchestrationTaskRunningAgent[]
  onClick: () => void
}): React.JSX.Element {
  // Why: parent may pass undefined during poll re-render races; never crash the list.
  const safeAgents = agents ?? []
  const summary = summarizeRunningAgents(safeAgents)
  return (
    <button
      type="button"
      className={cn(
        'flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-accent',
        selected && 'bg-accent'
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <StatusChip status={task.status} />
        {task.pipeline_role ? (
          <span className="text-[10px] capitalize text-muted-foreground">{task.pipeline_role}</span>
        ) : null}
        {summary.total > 0 ? (
          <span
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
              summary.workingCount > 0
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
            )}
            title={safeAgents
              .map((a) => `${a.agentType}${a.model ? ` (${a.model})` : ''} · ${a.state}`)
              .join('\n')}
          >
            <Bot className="size-3" />
            {summary.workingCount > 0 ? `${summary.workingCount} working` : `${summary.total} live`}
            <span className="opacity-80">{summary.agentTypes.slice(0, 2).join(' · ')}</span>
          </span>
        ) : null}
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
  )
}
