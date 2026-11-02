import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import type { GitLabWorkItem } from '../../../../shared/types'
import { IssueBoardCard } from './IssueBoardCard'

export type IssueBoardColumnId = 'open' | 'closed'

export function IssueBoardColumn({
  id,
  title,
  issues,
  onOpenIssue,
  onDropIssue
}: {
  id: IssueBoardColumnId
  title: string
  issues: GitLabWorkItem[]
  onOpenIssue: (issue: GitLabWorkItem) => void
  onDropIssue: (issueId: string, column: IssueBoardColumnId) => void
}): React.JSX.Element {
  const [dragOver, setDragOver] = useState(false)

  return (
    <section
      className={cn(
        'flex min-h-0 w-[320px] shrink-0 flex-col rounded-lg border border-border/50 bg-muted/20',
        dragOver && 'border-primary/50 bg-primary/5'
      )}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        const issueId = event.dataTransfer.getData('application/x-orca-issue-id')
        if (issueId) {
          onDropIssue(issueId, id)
        }
      }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {issues.length}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 scrollbar-sleek">
        {issues.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-3 py-8 text-center text-xs text-muted-foreground">
            Drop issues here
          </div>
        ) : (
          issues.map((issue) => (
            <IssueBoardCard key={issue.id} issue={issue} onOpen={onOpenIssue} />
          ))
        )}
      </div>
    </section>
  )
}
