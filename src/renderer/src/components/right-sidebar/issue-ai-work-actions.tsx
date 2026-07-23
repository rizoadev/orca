import React, { useState } from 'react'
import { ExternalLink, GitPullRequest, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { clearIssueAiWork, useIssueAiWorkEntry } from './issue-ai-work-registry'
import { issueAiWorkRegistryKey } from './issues-panel-ai-work'
import type { RepoIssueProvider } from './repo-issue-provider'

// Why: PR-driven flow — merges happen on the provider (GitHub/GitLab) side
// after review, not locally in Orca. This surface only exposes the two safe
// terminal actions (open the branch in Source Control for PR/MR creation, or
// discard the branch when the AI attempt was not useful).
async function discardBranch(args: {
  worktreeId: string
  branchName: string
  onDone: () => void
}): Promise<void> {
  const store = useAppStore.getState()
  const result = await store.removeWorktree(args.worktreeId, false, {
    suppressPreservedBranchToast: true
  })
  if (!result.ok) {
    toast.error(result.error)
    return
  }
  args.onDone()
  toast.success(
    translate(
      'auto.components.right.sidebar.issuesPanel.discardedBranch',
      'Discarded branch {{value0}}.',
      { value0: args.branchName }
    )
  )
}

function openSourceControlForWorktree(worktreeId: string): void {
  const store = useAppStore.getState()
  store.setActiveWorktree(worktreeId)
  store.setRightSidebarTab('source-control')
  store.setRightSidebarOpen(true)
}

/** Compact branch chip for issue modal headers (right side). */
export function IssueAiWorkBranchLabel({
  provider,
  repoId,
  issueNumber,
  className
}: {
  provider: RepoIssueProvider
  repoId: string
  issueNumber: number
  className?: string
}): React.JSX.Element | null {
  const entry = useIssueAiWorkEntry(issueAiWorkRegistryKey(provider, repoId, issueNumber))
  if (!entry?.branchName) {
    return null
  }
  return (
    <span
      className={cn(
        'inline-flex max-w-[min(280px,40vw)] items-center truncate rounded-md border border-border/50 bg-muted/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground',
        className
      )}
      title={entry.branchName}
      onClick={(event) => event.stopPropagation()}
    >
      {translate('auto.components.right.sidebar.issuesPanel.branchLabel', 'Branch: {{value0}}', {
        value0: entry.branchName
      })}
    </span>
  )
}

export function IssueAiWorkActions({
  provider,
  repoId,
  issueNumber,
  /** When false, omit the branch chip (e.g. modal header already shows it). */
  showBranchLabel = true
}: {
  provider: RepoIssueProvider
  repoId: string
  issueNumber: number
  showBranchLabel?: boolean
}): React.JSX.Element | null {
  const entry = useIssueAiWorkEntry(issueAiWorkRegistryKey(provider, repoId, issueNumber))
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)
  const confirm = useConfirmationDialog()
  const [pending, setPending] = useState<'discard' | null>(null)

  if (!entry || entry.outcome !== 'succeeded' || !entry.branchName || !entry.repoId) {
    return null
  }

  const registryId = issueAiWorkRegistryKey(provider, repoId, issueNumber)
  const clear = (): void => {
    clearIssueAiWork(registryId)
  }

  const handleDiscard = async (): Promise<void> => {
    const branch = entry.branchName ?? ''
    const ok = await confirm({
      title: translate(
        'auto.components.right.sidebar.issuesPanel.discardConfirmTitle',
        'Discard branch {{value0}}?',
        { value0: branch }
      ),
      description: translate(
        'auto.components.right.sidebar.issuesPanel.discardConfirmBody',
        'The worktree folder and the branch will be removed. Any uncommitted changes will be lost. This does not affect the issue on the remote.'
      ),
      confirmLabel: translate(
        'auto.components.right.sidebar.issuesPanel.discardConfirmAction',
        'Discard'
      ),
      confirmVariant: 'destructive'
    })
    if (!ok) {
      return
    }
    try {
      await discardBranch({
        worktreeId: entry.worktreeId,
        branchName: branch,
        onDone: clear
      })
    } finally {
      setPending(null)
    }
  }

  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1 text-[10px]"
      onClick={(event) => event.stopPropagation()}
    >
      {showBranchLabel ? (
        <span
          className="mr-1 max-w-[min(220px,40vw)] truncate text-muted-foreground"
          title={entry.branchName}
        >
          {translate(
            'auto.components.right.sidebar.issuesPanel.branchLabel',
            'Branch: {{value0}}',
            {
              value0: entry.branchName
            }
          )}
        </span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="h-5 gap-1 px-1.5"
        onClick={() => setActiveWorktree(entry.worktreeId)}
        title={translate('auto.components.right.sidebar.issuesPanel.openWorktree', 'Open worktree')}
      >
        <ExternalLink className="size-3" />
        {translate('auto.components.right.sidebar.issuesPanel.openBtn', 'Open worktree')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="h-5 gap-1 px-1.5"
        onClick={() => openSourceControlForWorktree(entry.worktreeId)}
        title={translate(
          'auto.components.right.sidebar.issuesPanel.createPrTitle',
          'Review changes and create a Pull Request / Merge Request'
        )}
      >
        <GitPullRequest className="size-3" />
        {translate('auto.components.right.sidebar.issuesPanel.createPrBtn', 'Create PR/MR')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="h-5 gap-1 px-1.5 text-rose-600 hover:text-rose-700 dark:text-rose-400"
        disabled={pending !== null}
        onClick={() => {
          void handleDiscard()
        }}
      >
        {pending === 'discard' ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Trash2 className="size-3" />
        )}
        {translate('auto.components.right.sidebar.issuesPanel.discardBtn', 'Discard branch')}
      </Button>
    </div>
  )
}
