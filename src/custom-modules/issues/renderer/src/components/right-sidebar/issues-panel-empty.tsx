import React from 'react'
import { CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'

export function IssuesPanelEmpty({
  title,
  description,
  compact = false
}: {
  title: string
  description: string
  compact?: boolean
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 px-4 text-center',
        compact ? 'py-10' : 'min-h-0 flex-1 py-12'
      )}
    >
      <CircleDot className="mb-1 size-5 text-muted-foreground/70" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="max-w-[220px] text-xs text-muted-foreground">{description}</div>
    </div>
  )
}
