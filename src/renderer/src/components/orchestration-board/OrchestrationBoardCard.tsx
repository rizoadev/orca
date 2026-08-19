import React from 'react'
import { Bot, ListTree } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  orchestrationStatusTone,
  priorityTone,
  shortWorktreeLabel,
  taskBoardLabel,
  type OrchestrationBoardTask
} from './orchestration-board-model'

export function OrchestrationBoardCard({
  task,
  onSelect,
  subtaskCount = 0
}: {
  task: OrchestrationBoardTask
  onSelect: (task: OrchestrationBoardTask) => void
  /** Number of live subtasks under this task (manager breakdown). */
  subtaskCount?: number
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

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            {task.pipeline_role ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-1.5 py-0.5 text-[10px] capitalize">
                <Bot className="size-3" />
                {task.pipeline_role}
              </span>
            ) : null}
            <span
              className={cn(
                'inline-flex rounded-full border px-1.5 py-0.5 text-[10px] capitalize',
                orchestrationStatusTone(task.status)
              )}
            >
              {task.status}
            </span>
            {task.assignee_handle ? (
              <span className="font-mono">→ {task.assignee_handle}</span>
            ) : null}
            {subtaskCount > 0 ? (
              <span className="inline-flex items-center gap-1 font-mono">
                <ListTree className="size-3" />
                {subtaskCount}
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-muted-foreground/70">
            <span>{task.id.slice(0, 12)}</span>
            {worktree ? <span className="truncate">{worktree}</span> : null}
          </div>
        </div>
      </div>
    </button>
  )
}
