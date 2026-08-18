import { ChevronRight, CornerUpLeft } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { OrchestrationBoardTask } from './orchestration-board-model'
import { taskBoardLabel } from './orchestration-board-model'

/**
 * Header location trail for a task detail: pipeline root › parent › … › task.
 * Falls back to a single clickable parent link when no ancestor chain exists.
 */
export function OrchestrationTaskBreadcrumb({
  ancestors,
  task,
  parentTask,
  onOpenTask
}: {
  ancestors: OrchestrationBoardTask[] | undefined
  task: OrchestrationBoardTask
  parentTask?: OrchestrationBoardTask | null
  onOpenTask?: (task: OrchestrationBoardTask) => void
}): React.JSX.Element | null {
  if (ancestors?.length) {
    const selfLabel = taskBoardLabel(task)
    const hasSelfName = selfLabel !== task.id
    return (
      <nav
        aria-label={translate(
          'auto.components.orchestration.board.breadcrumbAria',
          'Task location'
        )}
        className="mb-1 flex max-w-full items-center gap-1 overflow-hidden text-[11px] text-muted-foreground"
      >
        {ancestors.map((ancestor, index) => (
          <span key={ancestor.id} className="flex min-w-0 items-center gap-1">
            {index > 0 ? <ChevronRight className="size-2.5 shrink-0" /> : null}
            <button
              type="button"
              onClick={() => onOpenTask?.(ancestor)}
              className="truncate text-muted-foreground transition-colors hover:text-foreground"
              title={taskBoardLabel(ancestor)}
            >
              {taskBoardLabel(ancestor)}
            </button>
          </span>
        ))}
        {hasSelfName ? (
          <>
            <ChevronRight className="size-2.5 shrink-0" />
            <span className="truncate font-medium text-foreground/80">{selfLabel}</span>
          </>
        ) : null}
      </nav>
    )
  }

  if ((parentTask || task.parent_id) && onOpenTask) {
    return (
      <button
        type="button"
        onClick={() =>
          onOpenTask(parentTask ?? ({ id: task.parent_id! } as OrchestrationBoardTask))
        }
        className="mb-1 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        title={translate('auto.components.orchestration.board.openParent', 'Open parent task')}
      >
        <CornerUpLeft className="size-3 shrink-0" />
        <span className="truncate">{parentTask ? taskBoardLabel(parentTask) : task.parent_id}</span>
      </button>
    )
  }

  return null
}
