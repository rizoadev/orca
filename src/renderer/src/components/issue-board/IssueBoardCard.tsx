import React from 'react'
import { CircleDot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GitLabWorkItem } from '../../../../shared/types'

export function IssueBoardCard({
  issue,
  isDragging,
  onOpen
}: {
  issue: GitLabWorkItem
  isDragging?: boolean
  onOpen: (issue: GitLabWorkItem) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-orca-issue-id', issue.id)
        event.dataTransfer.setData('text/plain', String(issue.number))
        event.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onOpen(issue)}
      className={cn(
        'group flex w-full cursor-grab flex-col gap-1.5 rounded-md border border-border/60 bg-card px-3 py-2.5 text-left shadow-sm transition-colors hover:border-border hover:bg-accent/40 active:cursor-grabbing',
        isDragging && 'opacity-50'
      )}
    >
      <div className="flex items-start gap-2">
        <CircleDot
          className={cn(
            'mt-0.5 size-3.5 shrink-0',
            issue.state === 'closed' ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'
          )}
        />
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
          {issue.title}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-5">
        <span className="font-mono text-[11px] text-muted-foreground">#{issue.number}</span>
        {issue.author ? (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <User className="size-3" />
            {issue.author}
          </span>
        ) : null}
        {(issue.labels ?? []).slice(0, 3).map((label) => (
          <span
            key={label}
            className="rounded-full border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            {label}
          </span>
        ))}
        {(issue.labels?.length ?? 0) > 3 ? (
          <span className="text-[10px] text-muted-foreground">
            +{(issue.labels?.length ?? 0) - 3}
          </span>
        ) : null}
      </div>
    </button>
  )
}
