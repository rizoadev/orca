import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, CornerDownRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  orchestrationStatusTone,
  taskBoardLabel,
  type OrchestrationBoardTask
} from './orchestration-board-model'
import { buildOrchestrationTaskForest, type OrchestrationTaskNode } from './orchestration-task-tree'

function StatusChip({ status }: { status: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize',
        orchestrationStatusTone(status)
      )}
    >
      {status}
    </span>
  )
}

function SubtaskNode({
  node,
  depth,
  onOpen
}: {
  node: OrchestrationTaskNode
  depth: number
  onOpen: (task: OrchestrationBoardTask) => void
}): React.JSX.Element {
  const { task, children } = node
  const [open, setOpen] = useState(depth === 0)
  const hasChildren = children.length > 0

  return (
    <div>
      <button
        type="button"
        onClick={() => onOpen(task)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50',
          depth > 0 && 'ml-4'
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setOpen((v) => !v)
            }}
            className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground/50" />
        )}
        <span className="line-clamp-1 min-w-0 flex-1 text-[13px] text-foreground">
          {taskBoardLabel(task)}
        </span>
        <StatusChip status={task.status} />
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {task.assignee_handle ?? '—'}
        </span>
      </button>
      {hasChildren && open
        ? children.map((child) => (
            <SubtaskNode key={child.task.id} node={child} depth={depth + 1} onOpen={onOpen} />
          ))
        : null}
    </div>
  )
}

export function OrchestrationSubtasksPanel({
  tasks,
  rootTask,
  onOpenTask,
  onAddSubtask
}: {
  tasks: OrchestrationBoardTask[]
  rootTask: OrchestrationBoardTask
  onOpenTask: (task: OrchestrationBoardTask) => void
  onAddSubtask: (title: string) => void
}): React.JSX.Element {
  const forest = useMemo(() => {
    const all = [rootTask, ...tasks.filter((t) => t.parent_id === rootTask.id)]
    return buildOrchestrationTaskForest(all)
  }, [rootTask, tasks])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const submit = (): void => {
    const title = draft.trim()
    if (!title) {
      return
    }
    onAddSubtask(title)
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {translate('auto.components.orchestration.subtasks.title', 'Subtasks')}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">{tasks.length}</span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="ml-auto h-6 gap-1 text-[11px]"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus className="size-3" />
          {translate('auto.components.orchestration.subtasks.add', 'Add subtask')}
        </Button>
      </div>

      {adding ? (
        <div className="flex shrink-0 gap-2 border-b border-border/50 px-3 py-2">
          <input
            autoFocus
            value={draft}
            placeholder={translate(
              'auto.components.orchestration.subtasks.placeholder',
              'Subtask title…'
            )}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                submit()
              }
              if (e.key === 'Escape') {
                setAdding(false)
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <Button type="button" size="xs" className="h-7" disabled={!draft.trim()} onClick={submit}>
            {translate('auto.components.orchestration.subtasks.create', 'Create')}
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-sleek">
        {forest.length === 0 || forest[0]!.children.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.orchestration.subtasks.empty',
                'No subtasks yet. Break this task into smaller work items for the AI leader.'
              )}
            </p>
          </div>
        ) : (
          forest[0]!.children.map((child) => (
            <SubtaskNode key={child.task.id} node={child} depth={0} onOpen={onOpenTask} />
          ))
        )}
      </div>
    </div>
  )
}
