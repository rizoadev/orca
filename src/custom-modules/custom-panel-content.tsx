/**
 * Custom panel content router.
 * Maps custom tab IDs to their lazy-loaded panel components.
 * Protected by ErrorBoundary so a custom panel failure never blanks the main Orca window.
 */
import React, { Suspense } from 'react'
import type { ActiveRightSidebarTab } from '@/store/slices/editor'
import { isCustomSidebarTab } from './custom-right-sidebar-tabs'

const IssuesPanel = React.lazy(() => import('./issues/panel'))
// VoicePanel disabled — Google Voice (Pi Standby) fitur dimatikan.
// const VoicePanel = React.lazy(() => import('./voice/panel'))

type State = { hasError: boolean; error: Error | null }

class PanelErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  override state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[CustomPanelContent] Error in custom panel:', error, errorInfo)
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-xs text-destructive space-y-2">
          <p className="font-semibold text-foreground">Gagal memuat panel kustom</p>
          <p className="font-mono text-[11px] bg-muted/60 text-muted-foreground p-2 rounded">
            {this.state.error?.message ?? 'Unknown error'}
          </p>
          <button
            type="button"
            className="text-xs text-primary underline font-medium"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Coba lagi
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function CustomPanelContent({
  tab,
  rightSidebarOpen
}: {
  tab: ActiveRightSidebarTab
  rightSidebarOpen?: boolean
}): React.JSX.Element | null {
  if (!isCustomSidebarTab(tab)) {
    return null
  }

  return (
    <PanelErrorBoundary>
      <Suspense fallback={<div className="p-4 text-muted-foreground text-xs">Memuat panel…</div>}>
        {tab === 'issues' && (
          <IssuesPanel isVisible={rightSidebarOpen === true && tab === 'issues'} />
        )}
        {/* voice (Pi Standby) disabled */}
      </Suspense>
    </PanelErrorBoundary>
  )
}
