import { translate } from '@/i18n/i18n'
import type { OrchestrationBoardTask } from './orchestration-board-model'

export function OrchestrationTaskSpecPane({
  task
}: {
  task: OrchestrationBoardTask
}): React.JSX.Element {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-sleek sm:p-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {translate('auto.components.orchestration.board.spec', 'Spec')}
      </h3>
      <pre className="whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/25 p-4 text-[13px] leading-relaxed">
        {task.spec}
      </pre>
      {task.result ? (
        <>
          <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {translate('auto.components.orchestration.board.storedResult', 'Stored result')}
          </h3>
          <pre className="whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/25 p-4 text-[12px] leading-relaxed text-muted-foreground">
            {task.result}
          </pre>
        </>
      ) : null}
    </div>
  )
}
