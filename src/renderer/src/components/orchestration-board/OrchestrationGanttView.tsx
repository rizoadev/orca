import { useMemo } from 'react'
import { Workflow } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  orchestrationStatusTone,
  taskBoardLabel,
  type OrchestrationBoardTask
} from './orchestration-board-model'

const STAGE_ORDER = ['manage', 'research', 'implement', 'test', 'review'] as const
type StageKey = (typeof STAGE_ORDER)[number]

function stageIndex(stage: string | null | undefined): number {
  const idx = STAGE_ORDER.indexOf(stage as StageKey)
  return idx === -1 ? 0 : idx
}

type PipelineRow = {
  rootId: string
  label: string
  cells: (OrchestrationBoardTask | null)[]
}

// Why: group tasks by pipeline; non-pipeline tasks form single-cell rows.
function buildRows(tasks: OrchestrationBoardTask[]): PipelineRow[] {
  const byPipeline = new Map<string, OrchestrationBoardTask[]>()
  const standalone: OrchestrationBoardTask[] = []
  for (const task of tasks) {
    if (task.pipeline_id) {
      const list = byPipeline.get(task.pipeline_id)
      if (list) {
        list.push(task)
      } else {
        byPipeline.set(task.pipeline_id, [task])
      }
    } else {
      standalone.push(task)
    }
  }

  const rows: PipelineRow[] = []
  for (const [rootId, list] of byPipeline) {
    const cells: (OrchestrationBoardTask | null)[] = STAGE_ORDER.map(() => null)
    let label = rootId
    for (const task of list) {
      const idx = stageIndex(task.pipeline_stage)
      cells[idx] = task
      if (task.pipeline_id === task.id) {
        label = taskBoardLabel(task)
      }
    }
    rows.push({ rootId, label, cells })
  }
  for (const task of standalone) {
    rows.push({ rootId: task.id, label: taskBoardLabel(task), cells: [task] })
  }
  rows.sort((a, b) => a.label.localeCompare(b.label))
  return rows
}

export function OrchestrationGanttView({
  tasks,
  onSelectTask
}: {
  tasks: OrchestrationBoardTask[]
  onSelectTask: (task: OrchestrationBoardTask) => void
}): React.JSX.Element {
  const rows = useMemo(() => buildRows(tasks), [tasks])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border/50 px-3 py-2">
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'auto.components.orchestration.gantt.hint',
            'Pipeline stage timeline — one row per product pipeline, one block per stage.'
          )}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scrollbar-sleek">
        <div className="min-w-[640px]">
          {/* Header: stage columns */}
          <div className="sticky top-0 z-10 grid grid-cols-[220px_repeat(5,1fr)] border-b border-border/60 bg-background">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {translate('auto.components.orchestration.gantt.pipeline', 'Pipeline')}
            </div>
            {STAGE_ORDER.map((stage) => (
              <div
                key={stage}
                className="border-l border-border/40 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {stage}
              </div>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Workflow className="size-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.orchestration.gantt.empty',
                  'No pipelines to show yet.'
                )}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {rows.map((row) => (
                <div
                  key={row.rootId}
                  className="grid grid-cols-[220px_repeat(5,1fr)] transition-colors hover:bg-accent/20"
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Workflow className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="line-clamp-1 text-xs font-medium text-foreground">
                      {row.label}
                    </span>
                  </div>
                  {STAGE_ORDER.map((stage, idx) => {
                    const task = row.cells[idx]
                    return (
                      <div key={stage} className="border-l border-border/30 p-1.5">
                        {task ? (
                          <button
                            type="button"
                            onClick={() => onSelectTask(task)}
                            className={cn(
                              'w-full rounded-md border px-2 py-1.5 text-left transition-colors hover:brightness-110',
                              orchestrationStatusTone(task.status)
                            )}
                            title={`${task.status} · attempt ${task.pipeline_attempt ?? 1}`}
                          >
                            <div className="line-clamp-1 text-[11px] font-medium">
                              {task.status}
                            </div>
                            <div className="line-clamp-1 text-[10px] opacity-80">
                              {task.assignee_handle ?? 'unassigned'}
                            </div>
                          </button>
                        ) : (
                          <div className="rounded-md border border-dashed border-border/40 px-2 py-1.5 text-center text-[10px] text-muted-foreground/50">
                            —
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
