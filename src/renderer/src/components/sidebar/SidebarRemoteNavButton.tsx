import React from 'react'
import { Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

export function SidebarRemoteNavButton(): React.JSX.Element {
  const openRemotePage = useAppStore((s) => s.openRemotePage)
  const activeView = useAppStore((s) => s.activeView)
  const active = activeView === 'remote'

  return (
    <button
      type="button"
      onClick={() => openRemotePage()}
      aria-current={active ? 'page' : undefined}
      title={translate('auto.components.sidebar.remote.tooltip', 'Open remote servers')}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <Server
        className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="flex-1">{translate('auto.components.sidebar.remote.label', 'Remote')}</span>
    </button>
  )
}
