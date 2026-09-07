import React from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'

// Left-sidebar entry for the Pi Office hub. Opens the global office view in the
// main content area (same shell as Issue Board / Agent Dashboard).
export function SidebarOfficeNavButton(): React.JSX.Element {
  const openOfficePage = useAppStore((s) => s.openOfficePage)
  const activeView = useAppStore((s) => s.activeView)
  const active = activeView === 'office'

  return (
    <button
      type="button"
      onClick={() => {
        openOfficePage()
      }}
      aria-current={active ? 'page' : undefined}
      title={translate('auto.components.sidebar.office.tooltip', 'Open Pi Office')}
      className={cn(
        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        active
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <Building2
        className={cn('size-4 shrink-0', !active && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className="flex-1">{translate('auto.components.sidebar.office.label', 'Office')}</span>
    </button>
  )
}
