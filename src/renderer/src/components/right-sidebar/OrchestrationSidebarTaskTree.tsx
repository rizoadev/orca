import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, CornerDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OrchestrationBoardTask } from '@/components/orchestration-board/orchestration-board-model'
import {
  buildOrchestrationTaskForest,
  type OrchestrationTaskNode
} from '@/components/orchestration-board/orchestration-task-tree'

function TaskStatusDot({ status }: { status: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        status === 'completed'
          ? 'bg-emerald-500'
          : status === 'failed'
            ? 'bg-destructive'
            : status === 'dispatched'
              ? 'bg-amber-500'
              : 'bg-muted-foreground/40'
      )}
    />
  )
}

function TaskLabel({ task }: { task: OrchestrationBoardTask }): React.JSX.Element {
  return (
    <span className="line-clamp-1 min-w-0 flex-1 text-[12px] text-foreground/90">
      {task.display_name?.trim() || task.task_title?.trim() || task.spec || task.id}
    </span>
  )
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onOpen
}: {
  node: OrchestrationTaskNode
  depth: number
  expanded: ReadonlySet<string>
  onToggle: (id: string) => void
  onOpen: (task: OrchestrationBoardTask) => void
}): React.JSX.Element {
  const { task, children } = node
  const hasChildren = children.length > 0
  const isExpanded = expanded.has(task.id)

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(task)}
        onKeyDown={(event) => {
          // Why: div role=button needs a keyboard affordance (row opens the task).
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(task)
          }
        }}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggle(task.id)
            }}
            className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span
            className={cn(
              'flex size-4 shrink-0 items-center justify-center',
              depth > 0 ? 'text-muted-foreground/50' : 'text-muted-foreground/30'
            )}
          >
            {depth > 0 ? (
              <CornerDownRight className="size-3" />
            ) : (
              <span className="size-1.5 rounded-full bg-muted-foreground/30" />
            )}
          </span>
        )}
        <TaskStatusDot status={task.status} />
        <TaskLabel task={task} />
        <span className="shrink-0 text-[10px] capitalize text-muted-foreground">{task.status}</span>
      </div>
      {hasChildren && isExpanded
        ? children.map((child) => (
            <TreeRow
              key={child.task.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))
        : null}
    </>
  )
}

export function OrchestrationSidebarTaskTree({
  tasks,
  onOpenTask
}: {
  tasks: OrchestrationBoardTask[]
  onOpenTask: (task: OrchestrationBoardTask) => void
}): React.JSX.Element | null {
  const forest = useMemo(() => buildOrchestrationTaskForest(tasks), [tasks])
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  // Why: auto-expand parents as they arrive so subtasks are visible without
  // manually expanding every collapsed row after the first load.
  useEffect(() => {
    const parentIds = new Set<string>()
    for (const task of tasks) {
      if (task.parent_id) {
        parentIds.add(task.parent_id)
      }
    }
    setExpanded((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of parentIds) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [tasks])

  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (forest.length === 0) {
    return null
  }

  return (
    <div className="space-y-0.5">
      {forest.map((node) => (
        <TreeRow
          key={node.task.id}
          node={node}
          depth={0}
          expanded={expanded}
          onToggle={toggle}
          onOpen={onOpenTask}
        />
      ))}
    </div>
  )
}
