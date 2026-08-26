import React from 'react'
import { Activity, Users, CheckCircle, AlertCircle, Building2 } from 'lucide-react'
import type { OfficeStats } from './use-office-data'

export function OfficeStatsBar({ stats }: { stats: OfficeStats }): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-4 border-b border-border/40 bg-muted/20 px-4 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Building2 className="size-3.5" />
        <span className="tabular-nums font-medium text-foreground">{stats.roomCount}</span>
        <span>rooms</span>
      </div>
      <div className="h-3 w-px bg-border/60" />
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Activity className="size-3.5 text-[#39ff14]" />
        <span className="tabular-nums font-medium text-foreground">{stats.activeTasks}</span>
        <span>active tasks</span>
      </div>
      <div className="h-3 w-px bg-border/60" />
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Users className="size-3.5" />
        <span className="tabular-nums font-medium text-foreground">{stats.activeAgents}</span>
        <span>agents working</span>
      </div>
      <div className="h-3 w-px bg-border/60" />
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CheckCircle className="size-3.5 text-[#00d9a5]" />
        <span className="tabular-nums font-medium text-foreground">{stats.completedTasks}</span>
        <span>done</span>
      </div>
      {stats.blockedTasks > 0 && (
        <>
          <div className="h-3 w-px bg-border/60" />
          <div className="flex items-center gap-1.5 text-[11px]">
            <AlertCircle className="size-3.5 text-destructive" />
            <span className="tabular-nums font-medium text-destructive">{stats.blockedTasks}</span>
            <span className="text-muted-foreground">blocked</span>
          </div>
        </>
      )}
      <div className="ml-auto text-[11px] tabular-nums text-muted-foreground">
        {stats.totalTasks} total tasks
      </div>
    </div>
  )
}
