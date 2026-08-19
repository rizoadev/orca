import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, CornerDownRight, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  orchestrationStatusTone,
  shortWorktreeLabel,
  taskBoardLabel,
  type OrchestrationBoardTask
} from './orchestration-board-model'
import {
  buildOrchestrationTaskForest,
  countOrchestrationTreeNodes,
  type OrchestrationTaskNode
} from './orchestration-task-tree'

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }
  return value
    .replace('T', ' ')
    .replace(/\.\d+Z?$/, '')
    .slice(0, 16)
}

function StatusChip({ status }: { status: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize',
        orchestrationStatusTone(status)
      )}
    >
      {status}
    </span>
  )
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
  onSelect
}: {
  node: OrchestrationTaskNode
  depth: number
  expanded: ReadonlySet<string>
  onToggle: (id: string) => void
  onSelect: (task: OrchestrationBoardTask) => void
}): React.JSX.Element {
  const { task, children } = node
  const hasChildren = children.length > 0
  const isExpanded = expanded.has(task.id)
  const worktree = shortWorktreeLabel(task.worktree_id)

  return (
    <>
      <tr
        className={cn(
          'group cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40',
          depth > 0 && 'bg-muted/10'
        )}
        onClick={() => onSelect(task)}
      >
        <td className="w-8 py-2 pl-2 pr-1 text-center">
          {depth === 0 ? (
            <span
              className={cn(
                'inline-block size-2 rounded-full',
                task.status === 'completed'
                  ? 'bg-emerald-500'
                  : task.status === 'failed'
                    ? 'bg-destructive'
                    : task.status === 'dispatched'
                      ? 'bg-amber-500'
                      : 'bg-muted-foreground/40'
              )}
              title={task.status}
            />
          ) : null}
        </td>
        <td className="min-w-[260px] py-2 pr-3">
          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 18 }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onToggle(task.id)
                }}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
              </button>
            ) : (
              <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground/50" />
            )}
            <span
              className={cn(
                'line-clamp-1 text-[13px]',
                depth === 0 ? 'font-medium text-foreground' : 'text-foreground/80'
              )}
            >
              {taskBoardLabel(task)}
            </span>
          </div>
        </td>
        <td className="py-2 pr-3">
          <StatusChip status={task.status} />
        </td>
        <td className="py-2 pr-3 text-[11px] capitalize text-muted-foreground">
          {task.pipeline_role ?? '—'}
        </td>
        <td className="py-2 pr-3 text-[11px] capitalize text-muted-foreground">
          {task.pipeline_stage ?? '—'}
          {task.pipeline_attempt && task.pipeline_attempt > 1 ? ` #${task.pipeline_attempt}` : ''}
        </td>
        <td className="py-2 pr-3 text-[11px] text-muted-foreground">
          {task.priority && task.priority !== 'medium' ? (
            <span className="uppercase tracking-wide">{task.priority}</span>
          ) : (
            <span className="text-muted-foreground/60">medium</span>
          )}
        </td>
        <td className="py-2 pr-3">
          {task.assignee_handle ? (
            <span className="font-mono text-[11px] text-foreground/80">{task.assignee_handle}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground/60">unassigned</span>
          )}
        </td>
        <td className="py-2 pr-3 text-[11px] text-muted-foreground">{worktree ?? '—'}</td>
        <td className="py-2 pr-3 text-[11px] tabular-nums text-muted-foreground">
          {formatTimestamp(task.created_at)}
        </td>
        <td className="py-2 pr-3 text-right">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onSelect(task)
            }}
            className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <MessageSquare className="size-3" />
            {translate('auto.components.orchestration.table.details', 'Details')}
          </button>
        </td>
      </tr>
      {hasChildren && isExpanded
        ? children.map((child) => (
            <TreeRow
              key={child.task.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))
        : null}
    </>
  )
}

export function OrchestrationTableView({
  tasks,
  onSelectTask
}: {
  tasks: OrchestrationBoardTask[]
  onSelectTask: (task: OrchestrationBoardTask) => void
}): React.JSX.Element {
  const forest = useMemo(() => buildOrchestrationTaskForest(tasks), [tasks])
  const total = useMemo(() => countOrchestrationTreeNodes(forest), [forest])
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  // Why: the list starts empty while polling; auto-expand roots as they
  // arrive so children are visible without the user manually expanding every
  // collapsed row after the first load.
  useEffect(() => {
    const rootIds = new Set(forest.map((node) => node.task.id))
    setExpanded((prev) => {
      if (rootIds.size === 0) {
        return prev
      }
      let changed = false
      const next = new Set(prev)
      for (const id of rootIds) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [forest])

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

  const expandAll = (): void => {
    const ids = new Set<string>()
    const visit = (node: OrchestrationTaskNode): void => {
      ids.add(node.task.id)
      for (const child of node.children) {
        visit(child)
      }
    }
    for (const root of forest) {
      visit(root)
    }
    setExpanded(ids)
  }

  const collapseAll = (): void => setExpanded(new Set())

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <button
          type="button"
          onClick={expandAll}
          className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {translate('auto.components.orchestration.table.expandAll', 'Expand all')}
        </button>
        <span className="text-muted-foreground/40">·</span>
        <button
          type="button"
          onClick={collapseAll}
          className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {translate('auto.components.orchestration.table.collapseAll', 'Collapse all')}
        </button>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {total} {translate('auto.components.orchestration.table.taskCount', 'tasks')}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scrollbar-sleek">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b border-border/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-8 py-2 pl-2 pr-1" />
              <th className="min-w-[260px] py-2 pr-3">
                {translate('auto.components.orchestration.table.task', 'Task')}
              </th>
              <th className="py-2 pr-3">
                {translate('auto.components.orchestration.table.status', 'Status')}
              </th>
              <th className="py-2 pr-3">
                {translate('auto.components.orchestration.table.role', 'Role')}
              </th>
              <th className="py-2 pr-3">
                {translate('auto.components.orchestration.table.stage', 'Stage')}
              </th>
              <th className="py-2 pr-3">
                {translate('auto.components.orchestration.table.priority', 'Priority')}
              </th>
              <th className="py-2 pr-3">
                {translate('auto.components.orchestration.table.assignee', 'Assignee')}
              </th>
              <th className="py-2 pr-3">
                {translate('auto.components.orchestration.table.worktree', 'Worktree')}
              </th>
              <th className="py-2 pr-3">
                {translate('auto.components.orchestration.table.created', 'Created')}
              </th>
              <th className="py-2 pr-3 text-right">
                {translate('auto.components.orchestration.table.details', 'Details')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {forest.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-xs text-muted-foreground">
                  {translate(
                    'auto.components.orchestration.table.empty',
                    'No orchestration tasks for this project yet.'
                  )}
                </td>
              </tr>
            ) : (
              forest.map((node) => (
                <TreeRow
                  key={node.task.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  onToggle={toggle}
                  onSelect={onSelectTask}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
