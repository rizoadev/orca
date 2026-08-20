/**
 * Repo + branch scope toggle for the S3 Uploads sidebar block: two compact
 * badges bound to the *current* repo/worktree. Clicking the repo badge lists
 * everything under orca-ide/.../repo/, clicking the branch badge narrows to
 * orca-ide/.../repo/{branch}/.
 */
import { cn } from '@/lib/utils'

export type S3BrowseScope = 'repo' | 'branch'

export function S3FilterBar({
  repoLabel,
  branchLabel,
  scope,
  onScopeChange
}: {
  repoLabel: string
  branchLabel: string
  scope: S3BrowseScope
  onScopeChange: (scope: S3BrowseScope) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-1.5">
      <button
        type="button"
        onClick={() => onScopeChange('repo')}
        className={cn(
          'flex h-6 min-w-0 max-w-[45%] items-center rounded-md border px-2 text-[11px] transition-colors',
          scope === 'repo'
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-transparent text-muted-foreground hover:bg-sidebar-accent'
        )}
      >
        <span className="truncate">{repoLabel}</span>
      </button>
      <button
        type="button"
        onClick={() => onScopeChange('branch')}
        className={cn(
          'flex h-6 min-w-0 flex-1 items-center rounded-md border px-2 font-mono text-[11px] transition-colors',
          scope === 'branch'
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-transparent text-muted-foreground hover:bg-sidebar-accent'
        )}
      >
        <span className="truncate">{branchLabel}</span>
      </button>
    </div>
  )
}
