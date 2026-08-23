import React from 'react'
import { LayoutDashboard, MessageCircleQuestion } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { DASHBOARD_BUCKET_ORDER, type DashboardBucket } from '../../../../shared/dashboard-snapshot'
import { useAgentBucketCounts } from '@/components/dashboard/useAgentBucketCounts'

const DASHBOARD_BUCKET_DOT_CLASS: Record<'working' | 'idle', string> = {
  working: 'bg-yellow-500',
  idle: 'bg-neutral-500/50'
}

function dashboardBucketLabel(bucket: DashboardBucket): string {
  switch (bucket) {
    case 'attention':
      return translate('dashboardPopout.bucket.attention', 'Needs You')
    case 'working':
      return translate('dashboardPopout.bucket.working', 'Working')
    case 'idle':
      return translate('dashboardPopout.bucket.idle', 'Idle')
  }
}

function DashboardBucketCounts({
  counts
}: {
  counts: Record<DashboardBucket, number>
}): React.JSX.Element | null {
  const active = DASHBOARD_BUCKET_ORDER.filter((bucket) => counts[bucket] > 0)
  if (active.length === 0) {
    return null
  }
  return (
    <span className="flex items-center gap-1.5">
      {active.map((bucket) => (
        <span
          key={bucket}
          aria-label={`${dashboardBucketLabel(bucket)}: ${counts[bucket]}`}
          className="inline-flex items-center gap-1 text-[10px] tabular-nums text-worktree-sidebar-foreground/55"
        >
          {bucket === 'attention' ? (
            <MessageCircleQuestion className="size-2.5 text-amber-500" aria-hidden />
          ) : (
            <span className={cn('size-1.5 rounded-full', DASHBOARD_BUCKET_DOT_CLASS[bucket])} />
          )}
          {counts[bucket]}
        </span>
      ))}
    </span>
  )
}

// Why: keep the dashboard's broad aggregate subscriptions out of SidebarNav so
// agent-status churn only updates this opt-in row, not the full navigation.
export function AgentDashboardSidebarEntry(): React.JSX.Element {
  const dashboardBucketCounts = useAgentBucketCounts()
  const openAgentDashboardPage = useAppStore((s) => s.openAgentDashboardPage)
  const activeView = useAppStore((s) => s.activeView)
  const active = activeView === 'agent-dashboard'

  return (
    <button
      type="button"
      onClick={() => {
        // Why: open in the main content area (same shell as Issue Board / Tasks), not a second Electron window.
        openAgentDashboardPage()
      }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <LayoutDashboard
        className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="flex-1">{translate('dashboard.sidebar.label', 'Agent Dashboard')}</span>
      <DashboardBucketCounts counts={dashboardBucketCounts} />
    </button>
  )
}
