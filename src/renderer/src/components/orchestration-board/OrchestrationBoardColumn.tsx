import React from 'react'
import { cn } from '@/lib/utils'
import { OrchestrationBoardCard } from './OrchestrationBoardCard'
import type {
  OrchestrationBoardColumnId,
  OrchestrationBoardTask
} from './orchestration-board-model'

const EMPTY: Record<string, number> = {}
export function OrchestrationBoardColumn({
  id,
  title,
  tasks,
  onSelectTask,
  subtaskCounts = EMPTY
}: {
  id: OrchestrationBoardColumnId
  title: string
  tasks: OrchestrationBoardTask[]
  onSelectTask: (task: OrchestrationBoardTask) => void
  subtaskCounts?: Record<string, number>
}): React.JSX.Element {
  return (
    <section
      data-column={id}
      className={cn(
        'flex min-h-0 w-[300px] shrink-0 flex-col rounded-lg border border-border/50 bg-muted/20'
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 scrollbar-sleek">
        {tasks.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-3 py-8 text-center text-xs text-muted-foreground">
            No tasks
          </div>
        ) : (
          tasks.map((task) => (
            <OrchestrationBoardCard
              key={task.id}
              task={task}
              subtaskCount={subtaskCounts[task.id] ?? 0}
              onSelect={onSelectTask}
            />
          ))
        )}
      </div>
    </section>
  )
}
