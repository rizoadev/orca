import { useMemo, useState } from 'react'
import { GanttChartSquare, Kanban, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  groupTasksByColumn,
  ORCHESTRATION_BOARD_COLUMNS,
  type OrchestrationBoardTask
} from './orchestration-board-model'
import { OrchestrationBoardColumn } from './OrchestrationBoardColumn'
import { OrchestrationTableView } from './OrchestrationTableView'
import { OrchestrationGanttView } from './OrchestrationGanttView'

export type OrchestrationWorkspaceView = 'table' | 'gantt' | 'kanban'

const VIEW_OPTIONS: {
  id: OrchestrationWorkspaceView
  label: string
  icon: typeof Table2
}[] = [
  { id: 'table', label: 'Table', icon: Table2 },
  { id: 'gantt', label: 'Gantt', icon: GanttChartSquare },
  { id: 'kanban', label: 'Kanban', icon: Kanban }
]

// Why: the full board hosts the dense three-view workspace; the right sidebar
// only links here so the views get full width instead of a cramped column.
export function OrchestrationBoardWorkspace({
  tasks,
  onSelectTask,
  defaultView = 'table'
}: {
  tasks: OrchestrationBoardTask[]
  onSelectTask: (task: OrchestrationBoardTask) => void
  defaultView?: OrchestrationWorkspaceView
}): React.JSX.Element {
  const [view, setView] = useState<OrchestrationWorkspaceView>(defaultView)
  const columns = groupTasksByColumn(tasks)

  const subtaskCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const task of tasks) {
      if (task.parent_id && counts[task.parent_id] !== undefined) {
        counts[task.parent_id] += 1
      } else if (task.parent_id) {
        counts[task.parent_id] = 1
      }
    }
    return counts
  }, [tasks])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border/40 px-3 py-1.5">
        {VIEW_OPTIONS.map((option) => {
          const Icon = option.icon
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setView(option.id)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                view === option.id
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon className="size-3.5" />
              {translate(`auto.components.orchestration.workspace.${option.id}`, option.label)}
            </button>
          )
        })}
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {tasks.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {view === 'table' ? (
          <OrchestrationTableView tasks={tasks} onSelectTask={onSelectTask} />
        ) : view === 'gantt' ? (
          <OrchestrationGanttView tasks={tasks} onSelectTask={onSelectTask} />
        ) : (
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3 scrollbar-sleek">
            {ORCHESTRATION_BOARD_COLUMNS.map((column) => (
              <OrchestrationBoardColumn
                key={column.id}
                id={column.id}
                title={column.title}
                tasks={columns[column.id]}
                subtaskCounts={subtaskCounts}
                onSelectTask={onSelectTask}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
