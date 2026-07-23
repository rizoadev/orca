import React from 'react'
import { KanbanSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useActiveRepo } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import { detectRepoIssueProvider } from '../right-sidebar/repo-issue-provider'

export function SidebarIssueBoardNavButton(): React.JSX.Element | null {
  const openIssuesBoardPage = useAppStore((s) => s.openIssuesBoardPage)
  const activeView = useAppStore((s) => s.activeView)
  const activeRepo = useActiveRepo()
  const provider = React.useMemo(() => detectRepoIssueProvider(activeRepo), [activeRepo])
  const canOpen = provider === 'gitlab'
  const active = activeView === 'issues-board'

  return (
    <button
      type="button"
      onClick={() => {
        if (!canOpen) {
          return
        }
        openIssuesBoardPage()
      }}
      aria-disabled={!canOpen}
      aria-current={active ? 'page' : undefined}
      title={
        canOpen
          ? translate('auto.components.sidebar.issueBoard.tooltip', 'Open GitLab issue board')
          : translate(
              'auto.components.sidebar.issueBoard.disabledTooltip',
              'Select a GitLab worktree to open the issue board'
            )
      }
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8',
        !canOpen && 'cursor-not-allowed opacity-50 hover:bg-transparent'
      )}
    >
      <KanbanSquare
        className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="flex-1">
        {translate('auto.components.sidebar.issueBoard.label', 'Issue Board')}
      </span>
    </button>
  )
}
