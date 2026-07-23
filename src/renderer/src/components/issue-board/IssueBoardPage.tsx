import React, { useCallback, useMemo, useState } from 'react'
import { ArrowLeft, KanbanSquare, LoaderCircle, Plus, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore } from '@/store'
import { useActiveRepo } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import type { GitLabWorkItem } from '../../../../shared/types'
import { detectRepoIssueProvider } from '../right-sidebar/repo-issue-provider'
import {
  IssuesPanelCreateDialog,
  type CreateIssueSubmitInput
} from '../right-sidebar/issues-panel-create-dialog'
import { IssuesPanelDetailModals } from '../right-sidebar/issues-panel-detail-modals'
import { createRepoIssue } from '../right-sidebar/issues-panel-create-actions'
import {
  applyIssueBoardFilter,
  collectLabels,
  EMPTY_ISSUE_BOARD_FILTER,
  type IssueBoardFilterState
} from './issue-board-filters'
import { IssueBoardColumn, type IssueBoardColumnId } from './IssueBoardColumn'
import { useIssueBoardData } from './use-issue-board-data'

export default function IssueBoardPage(): React.JSX.Element {
  const closeIssuesBoardPage = useAppStore((s) => s.closeIssuesBoardPage)
  const activeRepo = useActiveRepo()
  const provider = useMemo(() => detectRepoIssueProvider(activeRepo), [activeRepo])

  const { status, openIssues, closedIssues, error, refresh, moveIssue } = useIssueBoardData(
    provider === 'gitlab' ? activeRepo : null
  )

  const [filter, setFilter] = useState<IssueBoardFilterState>(EMPTY_ISSUE_BOARD_FILTER)
  const [selectedIssue, setSelectedIssue] = useState<GitLabWorkItem | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)

  const filteredOpen = useMemo(
    () => applyIssueBoardFilter(openIssues, filter),
    [openIssues, filter]
  )
  const filteredClosed = useMemo(
    () => applyIssueBoardFilter(closedIssues, filter),
    [closedIssues, filter]
  )
  const allLabels = useMemo(
    () => collectLabels([...openIssues, ...closedIssues]),
    [openIssues, closedIssues]
  )

  const issueById = useMemo(() => {
    const map = new Map<string, GitLabWorkItem>()
    for (const item of openIssues) {
      map.set(item.id, item)
    }
    for (const item of closedIssues) {
      map.set(item.id, item)
    }
    return map
  }, [openIssues, closedIssues])

  const handleDrop = useCallback(
    (issueId: string, column: IssueBoardColumnId) => {
      const issue = issueById.get(issueId)
      if (!issue) {
        return
      }
      void moveIssue(issue, column)
    },
    [issueById, moveIssue]
  )

  const handleCreate = useCallback(
    async (input: CreateIssueSubmitInput) => {
      if (!activeRepo || provider !== 'gitlab') {
        return
      }
      setCreateSubmitting(true)
      try {
        const created = await createRepoIssue({
          provider: 'gitlab',
          repo: activeRepo,
          input
        })
        if (created) {
          setCreateOpen(false)
          refresh()
        }
      } finally {
        setCreateSubmitting(false)
      }
    },
    [activeRepo, provider, refresh]
  )

  if (!activeRepo) {
    return (
      <EmptyBoardShell onBack={closeIssuesBoardPage}>
        <p className="text-sm text-muted-foreground">
          {translate(
            'auto.components.issueBoard.noRepo',
            'Select a GitLab worktree to open its issue board.'
          )}
        </p>
      </EmptyBoardShell>
    )
  }

  if (provider !== 'gitlab') {
    return (
      <EmptyBoardShell onBack={closeIssuesBoardPage}>
        <p className="text-sm text-muted-foreground">
          {translate(
            'auto.components.issueBoard.gitlabOnly',
            'Issue Board is GitLab-only for now. Open a GitLab repo worktree.'
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {activeRepo.displayName}
          {activeRepo.gitRemoteIdentity?.canonicalKey
            ? ` · ${activeRepo.gitRemoteIdentity.canonicalKey}`
            : ''}
        </p>
      </EmptyBoardShell>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={closeIssuesBoardPage}
          aria-label={translate('auto.components.issueBoard.back', 'Back')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <KanbanSquare className="size-4 text-muted-foreground" />
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-foreground">
            {translate('auto.components.issueBoard.title', 'Issue Board')}
          </h1>
          <p className="truncate text-[11px] text-muted-foreground">
            GitLab · {activeRepo.displayName}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter.query}
              onChange={(event) => setFilter((prev) => ({ ...prev, query: event.target.value }))}
              placeholder={translate(
                'auto.components.issueBoard.searchPlaceholder',
                'Search issues…'
              )}
              className="h-8 w-[200px] pl-7 text-xs"
            />
          </div>
          {allLabels.length > 0 ? (
            <Select
              value={filter.label || '__all__'}
              onValueChange={(value) =>
                setFilter((prev) => ({
                  ...prev,
                  label: value === '__all__' ? '' : value
                }))
              }
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue
                  placeholder={translate('auto.components.issueBoard.allLabels', 'All labels')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">
                  {translate('auto.components.issueBoard.allLabels', 'All labels')}
                </SelectItem>
                {allLabels.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={refresh}
            disabled={status === 'loading'}
          >
            <RefreshCw className={status === 'loading' ? 'size-3.5 animate-spin' : 'size-3.5'} />
            {translate('auto.components.issueBoard.refresh', 'Refresh')}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3.5" />
            {translate('auto.components.issueBoard.newIssue', 'New issue')}
          </Button>
        </div>
      </header>

      {error ? (
        <div className="border-b border-border px-4 py-2 text-xs text-destructive">{error}</div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4 scrollbar-sleek">
        {status === 'loading' && openIssues.length === 0 && closedIssues.length === 0 ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {translate('auto.components.issueBoard.loading', 'Loading issues…')}
          </div>
        ) : (
          <>
            <IssueBoardColumn
              id="open"
              title={translate('auto.components.issueBoard.columnOpen', 'Open')}
              issues={filteredOpen}
              onOpenIssue={setSelectedIssue}
              onDropIssue={handleDrop}
            />
            <IssueBoardColumn
              id="closed"
              title={translate('auto.components.issueBoard.columnClosed', 'Closed')}
              issues={filteredClosed}
              onOpenIssue={setSelectedIssue}
              onDropIssue={handleDrop}
            />
          </>
        )}
      </div>

      {activeRepo ? (
        <>
          <IssuesPanelDetailModals
            activeRepo={activeRepo}
            selectedGitHubItem={null}
            selectedGitLabItem={selectedIssue}
            onCloseGitHub={() => {}}
            onCloseGitLab={() => setSelectedIssue(null)}
            onUseGitHub={() => {}}
            onUseGitLab={() => setSelectedIssue(null)}
          />
          <IssuesPanelCreateDialog
            open={createOpen}
            provider="gitlab"
            repoLabel={activeRepo.displayName || activeRepo.path}
            submitting={createSubmitting}
            onOpenChange={setCreateOpen}
            onSubmit={(input) => {
              void handleCreate(input)
            }}
          />
        </>
      ) : null}
    </div>
  )
}

function EmptyBoardShell({
  onBack,
  children
}: {
  onBack: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Button type="button" variant="ghost" size="icon-xs" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <KanbanSquare className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">
          {translate('auto.components.issueBoard.title', 'Issue Board')}
        </h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {children}
      </div>
    </div>
  )
}
