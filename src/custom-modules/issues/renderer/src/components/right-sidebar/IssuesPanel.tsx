import React, { useEffect, useMemo, useState } from 'react'
import { FolderKanban, Plus, RefreshCw } from 'lucide-react'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { GitHubWorkItem, GitLabWorkItem, LinearIssue } from '../../../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { IssuesPanelCreateDialog } from './issues-panel-create-dialog'
import { IssuesPanelDetailModals } from './issues-panel-detail-modals'
import { IssuesPanelEmpty } from './issues-panel-empty'
import { IssuesPanelList } from './issues-panel-list'
import { LinearProjectPicker } from './linear-project-picker'
import { detectRepoIssueProvider } from './repo-issue-provider'
import { useIssueRowActions } from './use-issue-row-actions'
import { IssuesProviderTabs, providerLabel } from './issues-provider-tabs'
// import { createOrchestrationTaskFromIssue } from '@/lib/issue-to-orchestration-task_DISABLED' // not available
import { useIssueRowsFetch, type IssuesProviderTab } from './use-issue-rows-fetch'
import LinearIssueWorkspace from '@/components/LinearIssueWorkspace'

export default function IssuesPanel({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)

  const provider = useMemo(() => detectRepoIssueProvider(activeRepo), [activeRepo])
  const linearBinding = activeRepo?.linear ?? null
  // Why: the header is a provider switch. Default to the merged view so every
  // source is visible; single-provider tabs stay one click away.
  const [providerTab, setProviderTab] = useState<IssuesProviderTab | null>(null)
  const availableTabs = useMemo<IssuesProviderTab[]>(() => {
    const tabs: IssuesProviderTab[] = ['all']
    // Why: a repo has at most one remote issue provider; Linear is always
    // offered (picking it opens the attach dropdown when unset).
    if (provider === 'github' || provider === 'gitlab') {
      tabs.push(provider)
    }
    tabs.push('linear')
    return tabs
  }, [provider])
  const activeTab: IssuesProviderTab =
    providerTab && availableTabs.includes(providerTab) ? providerTab : 'all'
  // Why: create/close flows need a concrete provider; the merged view falls
  // back to the repo's detected one.
  const providerForCreate: 'github' | 'gitlab' | 'linear' =
    activeTab === 'all' ? (provider ?? 'linear') : activeTab
  const confirm = useConfirmationDialog()
  const { rows, setRows, loading, error, bumpRefresh, linearSourceContext } = useIssueRowsFetch({
    isVisible,
    repo: activeRepo,
    provider,
    activeTab,
    linearBinding
  })
  const [selectedGitHubItem, setSelectedGitHubItem] = useState<GitHubWorkItem | null>(null)
  const [selectedGitLabItem, setSelectedGitLabItem] = useState<GitLabWorkItem | null>(null)
  const [selectedLinearItem, setSelectedLinearItem] = useState<LinearIssue | null>(null)

  // Why: Electron window controls (minimize/maximize) sit over the slide-over
  // header; close the sheet when the window state changes so it never returns
  // stuck behind the overlay.
  useEffect(() => {
    if (!selectedLinearItem) {
      return
    }
    const closeSheet = (): void => {
      setSelectedLinearItem(null)
    }
    const unsubscribe = window.api.ui.onMaximizeChanged(closeSheet)
    window.addEventListener('blur', closeSheet)
    return () => {
      unsubscribe()
      window.removeEventListener('blur', closeSheet)
    }
  }, [selectedLinearItem])
  const [createOpen, setCreateOpen] = useState(false)
  const [linearPickerOpen, setLinearPickerOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [aiPlanningIssueId, setAiPlanningIssueId] = useState<string | null>(null)
  const [aiWorkingIssueId, setAiWorkingIssueId] = useState<string | null>(null)
  const [closingIssueId, setClosingIssueId] = useState<string | null>(null)
  // const [convertingIssueId, setConvertingIssueId] = useState<string | null>(null)
  // // const openOrchestrationBoardPage = useAppStore((s) => s.openOrchestrationBoardPage) // not available
  // // const setRightSidebarTab = useAppStore((s) => s.setRightSidebarTab) // unused
  // Why: switching worktrees/repos must not keep a detail dialog for the old repo.
  useEffect(() => {
    setSelectedGitHubItem(null)
    setSelectedGitLabItem(null)
    setSelectedLinearItem(null)
    setCreateOpen(false)
    setAiPlanningIssueId(null)
    setAiWorkingIssueId(null)
    setClosingIssueId(null)
    setProviderTab(null)
  }, [activeRepo?.id])

  const actions = useIssueRowActions({
    repo: activeRepo ?? null,
    worktreeId: activeWorktree?.id ?? null,
    providerTab: providerForCreate,
    linearBinding,
    confirm,
    selected: {
      githubId: selectedGitHubItem?.id ?? null,
      gitlabId: selectedGitLabItem?.id ?? null,
      linearId: selectedLinearItem?.id ?? null
    },
    setSelectedGitHub: setSelectedGitHubItem,
    setSelectedGitLab: setSelectedGitLabItem,
    setSelectedLinear: setSelectedLinearItem,
    setRows,
    setCreateOpen,
    setCreateSubmitting,
    setAiPlanningId: setAiPlanningIssueId,
    setAiWorkingId: setAiWorkingIssueId,
    setClosingId: setClosingIssueId,
    bumpRefresh
  })

  const {
    openIssue,
    askAiPlan,
    askAiWork,
    closeIssue,
    markIssueDone,
    createWorktree,
    useGitHubItem,
    useGitLabItem,
    useLinearItem,
    createIssue
  } = actions

  if (!activeRepo) {
    return (
      <IssuesPanelEmpty
        title={translate(
          'auto.components.right.sidebar.issuesPanel.noRepoTitle',
          'No repository selected'
        )}
        description={translate(
          'auto.components.right.sidebar.issuesPanel.noRepoBody',
          'Select a git worktree to browse its open issues.'
        )}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-col gap-1.5 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-foreground">
            {translate('auto.components.right.sidebar.issuesPanel.title', 'Issues')}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {providerLabel(activeTab)}
            {activeTab === 'linear' && linearBinding?.projectName
              ? ` · ${linearBinding.projectName}`
              : activeRepo.displayName
                ? ` · ${activeRepo.displayName}`
                : ''}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <IssuesProviderTabs
            tabs={availableTabs}
            activeTab={activeTab}
            onSelect={setProviderTab}
          />
          <div className="flex shrink-0 items-center gap-1.5">
            {activeTab !== 'linear' || linearBinding ? (
              <TooltipProvider delayDuration={300}>
                {activeTab === 'linear' && linearBinding ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setLinearPickerOpen((value) => !value)}
                        aria-label={translate(
                          'auto.components.right.sidebar.issuesPanel.linearChangeProject',
                          'Change Linear project'
                        )}
                      >
                        <FolderKanban className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {translate(
                        'auto.components.right.sidebar.issuesPanel.linearChangeProject',
                        'Change Linear project'
                      )}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setCreateOpen(true)}
                      aria-label={translate(
                        'auto.components.right.sidebar.issuesPanel.newIssue',
                        'New issue'
                      )}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {translate('auto.components.right.sidebar.issuesPanel.newIssue', 'New issue')}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={bumpRefresh}
                      disabled={loading}
                      aria-label={translate(
                        'auto.components.right.sidebar.issuesPanel.refresh',
                        'Refresh issues'
                      )}
                    >
                      <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {translate(
                      'auto.components.right.sidebar.issuesPanel.refresh',
                      'Refresh issues'
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="border-b border-border px-3 py-2 text-xs text-destructive">{error}</div>
      ) : null}

      {activeTab === 'linear' && (!linearBinding || linearPickerOpen) ? (
        <LinearProjectPicker
          onAttached={() => {
            setLinearPickerOpen(false)
            bumpRefresh()
          }}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        <IssuesPanelList
          loading={loading}
          rows={rows}
          worktreeId={activeWorktree?.id ?? null}
          connectionId={activeRepo.connectionId}
          aiPlanningIssueId={aiPlanningIssueId}
          aiWorkingIssueId={aiWorkingIssueId}
          closingIssueId={closingIssueId}
          convertingIssueId={null}
          onOpenIssue={openIssue}
          onAskAiPlan={(row, agent) => {
            void askAiPlan(row, agent)
          }}
          onAskAiWork={(row, agent, mode) => {
            void askAiWork(row, agent, mode)
          }}
          onCreateWorktree={createWorktree}
          onConvertToOrchestration={() => undefined}
          repoId={activeRepo?.id ?? null}
          onMarkDone={(row) => {
            void markIssueDone(row)
          }}
          onCloseIssue={(row) => {
            void closeIssue(row)
          }}
        />
      </div>

      <IssuesPanelCreateDialog
        open={createOpen}
        provider={providerForCreate}
        repoLabel={activeRepo.displayName || activeRepo.path}
        repoPath={activeRepo.path}
        submitting={createSubmitting}
        onOpenChange={setCreateOpen}
        onSubmit={createIssue}
      />

      <IssuesPanelDetailModals
        activeRepo={activeRepo}
        selectedGitHubItem={selectedGitHubItem}
        selectedGitLabItem={selectedGitLabItem}
        onCloseGitHub={() => setSelectedGitHubItem(null)}
        onCloseGitLab={() => setSelectedGitLabItem(null)}
        onUseGitHub={useGitHubItem}
        onUseGitLab={useGitLabItem}
      />

      <LinearIssueWorkspace
        issue={selectedLinearItem}
        variant="sheet"
        onUse={useLinearItem}
        onOpenIssue={(issue) => setSelectedLinearItem(issue)}
        onClose={() => setSelectedLinearItem(null)}
        sourceContext={linearSourceContext}
      />
    </div>
  )
}
