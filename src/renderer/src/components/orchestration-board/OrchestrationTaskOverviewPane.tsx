import { Bot, Copy, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { shortWorktreeLabel, type OrchestrationBoardTask } from './orchestration-board-model'
import type { OrchestrationBoardTaskThread } from './OrchestrationBoardTaskDialog'

function CopyChip({ value, label }: { value: string; label?: string }): React.JSX.Element {
  return (
    <button
      type="button"
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title={translate('auto.components.orchestration.board.copy', 'Copy')}
      onClick={() => {
        void navigator.clipboard.writeText(value)
      }}
    >
      <span className="truncate">{label ?? value}</span>
      <Copy className="size-3 shrink-0" />
    </button>
  )
}

export function OrchestrationTaskOverviewPane({
  task,
  thread,
  repoLabel,
  runningAgents,
  selectedSquadId,
  squadsEmpty,
  assigning,
  actionBusy,
  onAssign,
  onRetry,
  onStop,
  onDelete,
  onToggleAutopilot,
  autopilotBusy
}: {
  task: OrchestrationBoardTask
  thread: OrchestrationBoardTaskThread | null
  repoLabel: string | null
  runningAgents: {
    paneKey: string
    agentType: string
    state: string
    model?: string
    toolName?: string
    promptPreview?: string
  }[]
  selectedSquadId: string
  squadsEmpty: boolean
  assigning: boolean
  actionBusy: boolean
  onAssign: () => void
  onRetry?: () => void
  onStop: () => void
  onDelete: () => void
  onToggleAutopilot?: (enabled: boolean) => void
  autopilotBusy?: boolean
}): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-sleek sm:p-5">
      <section className="space-y-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {translate('auto.components.orchestration.board.overview', 'Overview')}
        </h3>
        <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-2 text-xs">
          <dt className="text-muted-foreground">Priority</dt>
          <dd className="capitalize">{task.priority ?? 'medium'}</dd>
          <dt className="text-muted-foreground">Repo</dt>
          <dd className="truncate font-mono">{repoLabel ?? task.repo_id ?? '—'}</dd>
          <dt className="text-muted-foreground">Worktree</dt>
          <dd className="truncate font-mono" title={task.worktree_id ?? undefined}>
            {shortWorktreeLabel(task.worktree_id) ?? task.worktree_id ?? '—'}
          </dd>
          <dt className="text-muted-foreground">Host</dt>
          <dd>{task.host_id ?? '—'}</dd>
          {task.pipeline_id ? (
            <>
              <dt className="text-muted-foreground">Pipeline</dt>
              <dd className="min-w-0">
                <CopyChip value={task.pipeline_id} label={task.pipeline_id.slice(0, 14)} />
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      {runningAgents.length > 0 ? (
        <section className="mt-5">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {translate('auto.components.orchestration.board.agents', 'Agents')}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {runningAgents.map((agent) => (
              <span
                key={agent.paneKey}
                className="inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]"
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    agent.state === 'working'
                      ? 'bg-emerald-500'
                      : agent.state === 'blocked'
                        ? 'bg-amber-500'
                        : 'bg-sky-500'
                  )}
                />
                <span className="font-medium capitalize">{agent.agentType}</span>
                <span className="capitalize text-muted-foreground">{agent.state}</span>
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {onToggleAutopilot && (task.pipeline_id || thread?.pipelineId) ? (
        <section className="mt-5">
          <div className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
            <div className="min-w-0">
              <div className="text-[12px] font-medium">
                {translate('auto.components.orchestration.board.autopilot', 'Fully autopilot')}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={thread?.autopilot === true}
              disabled={autopilotBusy || actionBusy}
              onClick={() => onToggleAutopilot(!(thread?.autopilot === true))}
              className={cn(
                'relative h-4 w-8 shrink-0 rounded-full transition-colors',
                thread?.autopilot ? 'bg-emerald-500' : 'bg-muted-foreground/30'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-3 rounded-full bg-background shadow transition-transform',
                  thread?.autopilot ? 'left-[18px]' : 'left-0.5'
                )}
              />
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-5 space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {translate('auto.components.orchestration.board.actions', 'Actions')}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {task.status === 'ready' ? (
            <Button
              type="button"
              size="sm"
              className="h-7 w-auto shrink-0 px-2.5 text-[11px]"
              disabled={!selectedSquadId || assigning || squadsEmpty}
              onClick={onAssign}
            >
              {assigning ? (
                <LoaderCircle className="size-3 animate-spin" />
              ) : (
                <Bot className="size-3" />
              )}
              {translate('auto.components.orchestration.board.assign.run', 'Assign & run')}
            </Button>
          ) : null}
          {task.status === 'dispatched' && onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-[11px]"
              disabled={actionBusy}
              onClick={onRetry}
            >
              {translate('auto.components.orchestration.board.retry', 'Retry / resume')}
            </Button>
          ) : null}
          {task.status !== 'completed' && task.status !== 'failed' ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-[11px]"
              disabled={actionBusy}
              onClick={onStop}
            >
              {translate('auto.components.orchestration.board.stop', 'Stop')}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-7 px-2.5 text-[11px]"
            disabled={actionBusy}
            onClick={onDelete}
          >
            {translate('auto.components.orchestration.board.delete', 'Delete')}
          </Button>
        </div>
      </section>
    </div>
  )
}
