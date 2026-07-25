import React from 'react'
import { cn } from '@/lib/utils'
import {
  priorityTone,
  shortWorktreeLabel,
  taskBoardLabel,
  type OrchestrationBoardTask
} from './orchestration-board-model'

export function OrchestrationBoardCard({
  task,
  onSelect
}: {
  task: OrchestrationBoardTask
  onSelect: (task: OrchestrationBoardTask) => void
}): React.JSX.Element {
  const label = taskBoardLabel(task)
  const tone = priorityTone(task.priority)
  const worktree = shortWorktreeLabel(task.worktree_id)

  return (
    <button
      type="button"
      onClick={() => onSelect(task)}
      className={cn(
        'w-full rounded-md border border-border/50 bg-card px-3 py-2.5 text-left shadow-sm transition-colors',
        'hover:border-border hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-1 size-1.5 shrink-0 rounded-full',
            tone === 'danger' && 'bg-destructive',
            tone === 'warn' && 'bg-amber-500',
            tone === 'muted' && 'bg-muted-foreground/40',
            tone === 'default' && 'bg-muted-foreground/70'
          )}
          title={task.priority ?? 'medium'}
        />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
            {label}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums">{task.id.slice(0, 12)}</span>
            {task.priority && task.priority !== 'medium' ? (
              <span className="uppercase tracking-wide">{task.priority}</span>
            ) : null}
            {task.assignee_handle ? <span>→ {task.assignee_handle}</span> : null}
            {worktree ? <span className="truncate">{worktree}</span> : null}
            {task.host_id && task.host_id !== 'local' ? (
              <span className="truncate">{task.host_id}</span>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  )
}
