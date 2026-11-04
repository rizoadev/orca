import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

type ProviderTab = 'all' | 'github' | 'gitlab' | 'linear'

/** Provider switch; hidden when the repo only offers Linear. */
export function IssuesProviderTabs({
  tabs,
  activeTab,
  onSelect
}: {
  tabs: ProviderTab[]
  activeTab: ProviderTab
  onSelect: (tab: ProviderTab) => void
}): React.JSX.Element | null {
  if (tabs.length <= 1) {
    return null
  }
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/30 p-0.5">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onSelect(tab)}
          className={cn(
            'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
            activeTab === tab
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {providerLabel(tab)}
        </button>
      ))}
    </div>
  )
}

export function providerLabel(tab: ProviderTab): string {
  return tab === 'all'
    ? translate('auto.components.right.sidebar.issuesPanel.allLabel', 'All')
    : tab === 'github'
      ? translate('auto.i18n.hostedReview.copy.c7d1e5f9a8', 'GitHub')
      : tab === 'gitlab'
        ? translate('auto.i18n.hostedReview.copy.91b5c8d7e6', 'GitLab')
        : translate('auto.components.right.sidebar.issuesPanel.linearLabel', 'Linear')
}
