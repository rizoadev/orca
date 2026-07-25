import React from 'react'
import { Workflow } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

export function SidebarOrchestrationBoardNavButton(): React.JSX.Element {
  const openOrchestrationBoardPage = useAppStore((s) => s.openOrchestrationBoardPage)
  const activeView = useAppStore((s) => s.activeView)
  const active = activeView === 'orchestration-board'

  return (
    <button
      type="button"
      onClick={() => openOrchestrationBoardPage()}
      aria-current={active ? 'page' : undefined}
      title={translate(
        'auto.components.sidebar.orchestrationBoard.tooltip',
        'Open orchestration task board'
      )}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <Workflow
        className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="flex-1">
        {translate('auto.components.sidebar.orchestrationBoard.label', 'Orchestration')}
      </span>
    </button>
  )
}
