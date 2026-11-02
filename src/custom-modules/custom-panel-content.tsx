/**
 * Custom panel content router.
 * Maps custom tab IDs to their lazy-loaded panel components.
 */
import React, { Suspense } from 'react'
import type { ActiveRightSidebarTab } from '@/store/slices/editor'
import { isCustomSidebarTab } from './custom-right-sidebar-tabs'

const IssuesPanel = React.lazy(() => import('./issues/panel'))

export function CustomPanelContent({
  tab
}: {
  tab: ActiveRightSidebarTab
  rightSidebarOpen?: boolean
}): React.JSX.Element | null {
  if (!isCustomSidebarTab(tab)) {
    return null
  }
  return (
    <Suspense fallback={<div className="p-4 text-muted-foreground text-sm">Loading…</div>}>
      {tab === 'issues' && <IssuesPanel />}
    </Suspense>
  )
}
