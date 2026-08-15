import React from 'react'
import { StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

export function SidebarNotesNavButton(): React.JSX.Element {
  const openNotesPage = useAppStore((s) => s.openNotesPage)
  const activeView = useAppStore((s) => s.activeView)
  const active = activeView === 'notes'

  return (
    <button
      type="button"
      onClick={() => openNotesPage()}
      aria-current={active ? 'page' : undefined}
      title={translate('auto.components.sidebar.notes.tooltip', 'Open notes')}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <StickyNote
        className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="flex-1">
        {translate('auto.components.sidebar.notes.label', 'Notes')}
      </span>
    </button>
  )
}