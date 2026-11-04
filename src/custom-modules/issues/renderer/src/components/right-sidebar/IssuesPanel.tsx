import React, { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { GitHubWorkItem, GitLabWorkItem, LinearIssue } from '../../../../../../shared/types'
import { normalizeTaskSourceContext } from '../../../../../../shared/task-source-context'
import { translate } from '@/i18n/i18n'
import { IssuesPanelCreateDialog } from './issues-panel-create-dialog'
import { IssuesPanelDetailModals } from './issues-panel-detail-modals'
import { IssuesPanelEmpty } from './issues-panel-empty'
import { IssuesPanelList } from './issues-panel-list'
import { LinearProjectPicker } from './linear-project-picker'
import { detectRepoIssueProvider } from './repo-issue-provider'
import { useIssueRowActions } from './use-issue-row-actions'
import { IssuesProviderTabs, providerLabel } from './issues-provider-tabs'
import { observeLinearIssueRead } from '@/store/slices/linear/linear-issue-publication'
// import { createOrchestrationTaskFromIssue } from '@/lib/issue-to-orchestration-task_DISABLED' // not available
import {
  getRepoIssueSourceContext,
  GITHUB_OPEN_ISSUES_QUERY,
  ISSUE_LIST_LIMIT,
  toGitHubIssueRows,
  toGitLabIssueRows,
  toLinearIssueRows,
  type IssueRow
} from './issues-panel-rows'
import LinearIssueWorkspace from '@/components/LinearIssueWorkspace'

/** Provider tab ids shown in the Issues header. */
type IssuesProviderTab = 'github' | 'gitlab' | 'linear'

export default function IssuesPanel({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const fetchWorkItems = useAppStore((s) => s.fetchWorkItems)

  const provider = useMemo(() => detectRepoIssueProvider(activeRepo), [activeRepo])
  const linearBinding = activeRepo?.linear ?? null
  // Why: the header is a provider switch. Default to the auto-detected remote
  // provider so existing GitHub/GitLab repos look unchanged; a repo with an
  // attached Linear project can flip to Linear even without a Linear remote.
  const [providerTab, setProviderTab] = useState<IssuesProviderTab | null>(null)
  const availableTabs = useMemo<IssuesProviderTab[]>(() => {
    const tabs: IssuesProviderTab[] = []
    if (provider === 'github' || provider === 'gitlab') {
      tabs.push(provider)
    }
    // Why: Linear needs an attached project before it can list anything, so it
    // is always offered — picking it opens the attach dropdown when unset.
    tabs.push('linear')
    return tabs
  }, [provider])
  const activeTab: IssuesProviderTab =
    providerTab && availableTabs.includes(providerTab) ? providerTab : (provider ?? 'linear')
  const confirm = useConfirmationDialog()
  const [rows, setRows] = useState<IssueRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [selectedGitHubItem, setSelectedGitHubItem] = useState<GitHubWorkItem | null>(null)
  const [selectedGitLabItem, setSelectedGitLabItem] = useState<GitLabWorkItem | null>(null)
  const [selectedLinearItem, setSelectedLinearItem] = useState<LinearIssue | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [aiPlanningIssueId, setAiPlanningIssueId] = useState<string | null>(null)
  const [aiWorkingIssueId, setAiWorkingIssueId] = useState<string | null>(null)
  const [closingIssueId, setClosingIssueId] = useState<string | null>(null)
  // const [convertingIssueId, setConvertingIssueId] = useState<string | null>(null)
  // // const openOrchestrationBoardPage = useAppStore((s) => s.openOrchestrationBoardPage) // not available
  // // const setRightSidebarTab = useAppStore((s) => s.setRightSidebarTab) // unused
  const listLinearProjectIssues = useAppStore((s) => s.listLinearProjectIssues)
  const linearSourceContext = useMemo(() => {
    const base = getRepoIssueSourceContext(activeRepo, 'linear')
    if (!base || !linearBinding) {
      return base
    }
    // Why: Linear caches key off the workspace; folding the attached workspace
    // into the source context keeps this repo's reads isolated from others.
    return normalizeTaskSourceContext({
      ...base,
      providerIdentity: {
        provider: 'linear',
        workspaceId: linearBinding.workspaceId,
        workspaceName: linearBinding.workspaceName ?? null
      }
    })
  }, [activeRepo, linearBinding])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (!isVisible || !activeRepo || activeTab === 'linear') {
        if (!cancelled) {
          setRows([])
          setError(null)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError(null)
      try {
        if (activeTab === 'github') {
          const sourceContext = getRepoIssueSourceContext(activeRepo, 'github')
          const items = await fetchWorkItems(
            activeRepo.id,
            activeRepo.path,
            ISSUE_LIST_LIMIT,
            GITHUB_OPEN_ISSUES_QUERY,
            { force: refreshNonce > 0, sourceContext }
          )
          if (cancelled) {
            return
          }
          setRows(toGitHubIssueRows(items ?? []))
          return
        }

        const sourceContext = getRepoIssueSourceContext(activeRepo, 'gitlab')
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: gl.listIssues types error as a wider union than this list reads.
        const result = (await window.api.gl.listIssues({
          repoPath: activeRepo.path,
          repoId: activeRepo.id,
          sourceContext,
          state: 'opened',
          limit: ISSUE_LIST_LIMIT
        })) as {
          items: GitLabWorkItem[]
          error?: { type?: string; message: string }
        }
        if (cancelled) {
          return
        }
        if (result.error && result.error.type !== 'not_found') {
          setError(result.error.message)
        } else {
          setError(null)
        }
        setRows(toGitLabIssueRows(result.items, activeRepo.id))
      } catch (err) {
        if (!cancelled) {
          setRows([])
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeRepo, activeTab, fetchWorkItems, isVisible, refreshNonce])

  // Why: Linear reads go through the store (workspace/project caches) rather
  // than the gh/gl IPC namespaces, so they live in their own effect.
  useEffect(() => {
    let cancelled = false
    if (!isVisible || !activeRepo || activeTab !== 'linear' || !linearBinding) {
      setRows([])
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const read = listLinearProjectIssues(
      linearBinding.projectId,
      linearBinding.workspaceId,
      ISSUE_LIST_LIMIT,
      { force: refreshNonce > 0, sourceContext: linearSourceContext }
    )
    const release = observeLinearIssueRead(
      read,
      () => !cancelled,
      (_lease, view) => {
        if (cancelled) {
          return
        }
        if (view.kind === 'loading') {
          setLoading(true)
          return
        }
        setLoading(false)
        if (view.kind === 'error') {
          setRows([])
          setError(view.error instanceof Error ? view.error.message : String(view.error))
          return
        }
        const data = view.data
        setError(data?.errors?.length ? (data.errors[0]?.message ?? null) : null)
        setRows(data ? toLinearIssueRows(data.items) : [])
      }
    )
    return () => {
      cancelled = true
      release()
    }
  }, [
    activeRepo,
    activeTab,
    isVisible,
    linearBinding,
    linearSourceContext,
    listLinearProjectIssues,
    refreshNonce
  ])

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
    providerTab: activeTab,
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
    bumpRefresh: () => setRefreshNonce((value) => value + 1)
  })

  const {
    openIssue,
    askAiPlan,
    askAiWork,
    closeIssue,
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
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
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
        <div className="flex shrink-0 items-center gap-1.5">
          <IssuesProviderTabs
            tabs={availableTabs}
            activeTab={activeTab}
            onSelect={setProviderTab}
          />
          {activeTab !== 'linear' || linearBinding ? (
            <TooltipProvider delayDuration={300}>
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
                    onClick={() => setRefreshNonce((value) => value + 1)}
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
                  {translate('auto.components.right.sidebar.issuesPanel.refresh', 'Refresh issues')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="border-b border-border px-3 py-2 text-xs text-destructive">{error}</div>
      ) : null}

      {activeTab === 'linear' && !linearBinding ? (
        <LinearProjectPicker onAttached={() => setRefreshNonce((value) => value + 1)} />
      ) : (
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
            onConvertToOrchestration={() => undefined}
            repoId={activeRepo?.id ?? null}
            onCloseIssue={(row) => {
              void closeIssue(row)
            }}
          />
        </div>
      )}

      <IssuesPanelCreateDialog
        open={createOpen}
        provider={activeTab}
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
