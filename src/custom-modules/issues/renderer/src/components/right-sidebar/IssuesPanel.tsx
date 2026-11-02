/* eslint-disable max-lines -- Why: the panel owns the whole issues sidebar
 * orchestration (list fetching, filters, issue/PR actions, detail modal wiring);
 * the GoT change is a one-prop pass-through. */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import type {
  GitHubWorkItem,
  GitLabWorkItem,
  LinearIssue,
  TuiAgent
} from '../../../../shared/types'
import { normalizeTaskSourceContext } from '../../../../shared/task-source-context'
import { translate } from '@/i18n/i18n'
import { launchIssueAiPlanCommenter } from './issues-panel-ai-plan'
import { launchIssueAiWorker, type IssueAiWorkMode } from './issues-panel-ai-work'
import { confirmCloseIssue } from './issues-panel-close-confirm'
import { closeRepoIssue, createRepoIssue } from './issues-panel-create-actions'
import { IssuesPanelCreateDialog, type CreateIssueSubmitInput } from './issues-panel-create-dialog'
import { IssuesPanelDetailModals } from './issues-panel-detail-modals'
import { IssuesPanelEmpty } from './issues-panel-empty'
import { IssuesPanelList } from './issues-panel-list'
import { LinearProjectPicker } from './linear-project-picker'
import {
  startGitHubIssueFromPanel,
  startGitLabIssueFromPanel,
  startLinearIssueFromPanel
} from './issues-panel-workspace-actions'
import { detectRepoIssueProvider } from './repo-issue-provider'
import { createOrchestrationTaskFromIssue } from '@/lib/issue-to-orchestration-task'
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
  const openModal = useAppStore((s) => s.openModal)
  const confirm = useConfirmationDialog()

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
  const [convertingIssueId, setConvertingIssueId] = useState<string | null>(null)
  const openOrchestrationBoardPage = useAppStore((s) => s.openOrchestrationBoardPage)
  const setRightSidebarTab = useAppStore((s) => s.setRightSidebarTab)
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
          setRows(toGitHubIssueRows(items))
          return
        }

        const sourceContext = getRepoIssueSourceContext(activeRepo, 'gitlab')
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
    void (async () => {
      if (!isVisible || !activeRepo || activeTab !== 'linear' || !linearBinding) {
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
        const result = await listLinearProjectIssues(
          linearBinding.projectId,
          linearBinding.workspaceId,
          ISSUE_LIST_LIMIT,
          { force: refreshNonce > 0, sourceContext: linearSourceContext }
        )
        if (cancelled) {
          return
        }
        if (result.errors?.length) {
          setError(result.errors[0]?.message ?? null)
        }
        setRows(toLinearIssueRows(result.items))
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

  const providerLabel =
    activeTab === 'github'
      ? translate('auto.i18n.hostedReview.copy.c7d1e5f9a8', 'GitHub')
      : activeTab === 'gitlab'
        ? translate('auto.i18n.hostedReview.copy.91b5c8d7e6', 'GitLab')
        : translate('auto.components.right.sidebar.issuesPanel.linearLabel', 'Linear')

  const openIssue = useCallback((row: IssueRow) => {
    if (row.provider === 'github' && row.githubItem) {
      setSelectedGitLabItem(null)
      setSelectedLinearItem(null)
      setSelectedGitHubItem(row.githubItem)
      return
    }
    if (row.provider === 'gitlab' && row.gitlabItem) {
      setSelectedGitHubItem(null)
      setSelectedLinearItem(null)
      setSelectedGitLabItem(row.gitlabItem)
      return
    }
    if (row.provider === 'linear' && row.linearItem) {
      setSelectedGitHubItem(null)
      setSelectedGitLabItem(null)
      setSelectedLinearItem(row.linearItem)
    }
  }, [])

  const handleAskAiPlan = useCallback(
    async (row: IssueRow, agent: TuiAgent) => {
      if (!activeRepo || !activeWorktree) {
        return
      }
      setAiPlanningIssueId(row.id)
      try {
        await launchIssueAiPlanCommenter({
          worktreeId: activeWorktree.id,
          repo: activeRepo,
          agent,
          issue: {
            provider: row.provider,
            number: row.number,
            identifier: row.linearItem?.identifier ?? null,
            title: row.title,
            url: row.url,
            body: row.linearItem?.description
          }
        })
      } finally {
        setAiPlanningIssueId((current) => (current === row.id ? null : current))
      }
    },
    [activeRepo, activeWorktree]
  )

  const handleAskAiWork = useCallback(
    async (row: IssueRow, agent: TuiAgent, mode: IssueAiWorkMode) => {
      if (!activeRepo || !activeWorktree) {
        return
      }
      setAiWorkingIssueId(row.id)
      try {
        await launchIssueAiWorker({
          worktreeId: activeWorktree.id,
          repo: activeRepo,
          agent,
          mode,
          issue: {
            provider: row.provider,
            number: row.number,
            identifier: row.linearItem?.identifier ?? null,
            workspaceId: row.linearItem?.workspaceId ?? null,
            title: row.title,
            url: row.url,
            body: row.linearItem?.description
          }
        })
      } finally {
        setAiWorkingIssueId((current) => (current === row.id ? null : current))
      }
    },
    [activeRepo, activeWorktree]
  )

  const handleConvertToOrchestration = useCallback(
    async (row: IssueRow) => {
      if (!activeRepo) {
        return
      }
      setConvertingIssueId(row.id)
      try {
        const body =
          row.githubItem && 'body' in row.githubItem
            ? String((row.githubItem as { body?: string | null }).body ?? '')
            : row.gitlabItem && 'description' in row.gitlabItem
              ? String((row.gitlabItem as { description?: string | null }).description ?? '')
              : row.linearItem?.description
                ? String(row.linearItem.description)
                : ''
        const result = await createOrchestrationTaskFromIssue({
          provider: row.provider,
          issueNumber: row.number ?? 0,
          issueIdentifier: row.linearItem?.identifier ?? null,
          title: row.title,
          url: row.url,
          body,
          repoId: activeRepo.id,
          worktreeId: activeWorktree?.id ?? null,
          hostId: activeRepo.connectionId ? `ssh:${activeRepo.connectionId}` : 'local'
        })
        // Why: stay on workspace chrome and open the companion sidebar tab only.
        // Auto-jumping to the full board made the right-bar tab feel "broken".
        setRightSidebarTab('orchestration')
        toast.success(
          result.coalesced
            ? translate(
                'auto.components.right.sidebar.issuesPanel.orchestrationExists',
                'Orchestration task already exists for {{ref}}',
                { ref: row.label }
              )
            : translate(
                'auto.components.right.sidebar.issuesPanel.orchestrationCreated',
                'Created orchestration task for {{ref}}',
                { ref: row.label }
              ),
          {
            description: result.task.id,
            action: {
              label: translate('auto.components.right.sidebar.issuesPanel.openBoard', 'Board'),
              onClick: () => openOrchestrationBoardPage()
            }
          }
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setConvertingIssueId((current) => (current === row.id ? null : current))
      }
    },
    [activeRepo, activeWorktree?.id, openOrchestrationBoardPage, setRightSidebarTab]
  )

  const handleCloseIssue = useCallback(
    async (row: IssueRow) => {
      if (!activeRepo) {
        return
      }
      const confirmed = await confirmCloseIssue(confirm, row)
      if (!confirmed) {
        return
      }
      setClosingIssueId(row.id)
      try {
        const ok = await closeRepoIssue({ repo: activeRepo, row })
        if (!ok) {
          return
        }
        setRows((current) => current.filter((item) => item.id !== row.id))
        if (selectedGitHubItem?.id === row.id) {
          setSelectedGitHubItem(null)
        }
        if (selectedGitLabItem?.id === row.id) {
          setSelectedGitLabItem(null)
        }
        if (selectedLinearItem?.id === row.id) {
          setSelectedLinearItem(null)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setClosingIssueId((current) => (current === row.id ? null : current))
      }
    },
    [activeRepo, confirm, selectedGitHubItem?.id, selectedGitLabItem?.id, selectedLinearItem?.id]
  )

  const handleUseGitHubItem = useCallback(
    (item: GitHubWorkItem) => {
      if (!activeRepo) {
        return
      }
      startGitHubIssueFromPanel(openModal, activeRepo, item)
    },
    [activeRepo, openModal]
  )

  const handleUseGitLabItem = useCallback(
    (item: GitLabWorkItem) => {
      if (!activeRepo) {
        return
      }
      startGitLabIssueFromPanel(openModal, activeRepo, item)
    },
    [activeRepo, openModal]
  )

  const handleUseLinearItem = useCallback(
    (item: LinearIssue) => {
      if (!activeRepo) {
        return
      }
      startLinearIssueFromPanel(openModal, activeRepo, item)
    },
    [activeRepo, openModal]
  )

  const handleCreateIssue = useCallback(
    async (input: CreateIssueSubmitInput) => {
      if (!activeRepo) {
        return
      }
      setCreateSubmitting(true)
      try {
        const created = await createRepoIssue({
          provider: activeTab,
          repo: activeRepo,
          input,
          linearBinding
        })
        if (!created) {
          return
        }
        setCreateOpen(false)
        if (created.provider === 'github') {
          setSelectedGitHubItem(created.item)
        } else if (created.provider === 'gitlab') {
          setSelectedGitLabItem(created.item)
        } else {
          setSelectedLinearItem(created.item)
        }
        setRefreshNonce((value) => value + 1)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setCreateSubmitting(false)
      }
    },
    [activeRepo, activeTab, linearBinding]
  )

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

  const providerTabs =
    availableTabs.length > 1 ? (
      <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/30 p-0.5">
        {availableTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setProviderTab(tab)}
            className={cn(
              'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              activeTab === tab
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab === 'github'
              ? translate('auto.i18n.hostedReview.copy.c7d1e5f9a8', 'GitHub')
              : tab === 'gitlab'
                ? translate('auto.i18n.hostedReview.copy.91b5c8d7e6', 'GitLab')
                : translate('auto.components.right.sidebar.issuesPanel.linearLabel', 'Linear')}
          </button>
        ))}
      </div>
    ) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-foreground">
            {translate('auto.components.right.sidebar.issuesPanel.title', 'Issues')}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {providerLabel}
            {activeTab === 'linear' && linearBinding?.projectName
              ? ` · ${linearBinding.projectName}`
              : activeRepo.displayName
                ? ` · ${activeRepo.displayName}`
                : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {providerTabs}
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
            convertingIssueId={convertingIssueId}
            onOpenIssue={openIssue}
            onAskAiPlan={(row, agent) => {
              void handleAskAiPlan(row, agent)
            }}
            onAskAiWork={(row, agent, mode) => {
              void handleAskAiWork(row, agent, mode)
            }}
            onConvertToOrchestration={(row) => {
              void handleConvertToOrchestration(row)
            }}
            repoId={activeRepo?.id ?? null}
            onCloseIssue={(row) => {
              void handleCloseIssue(row)
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
        onSubmit={handleCreateIssue}
      />

      <IssuesPanelDetailModals
        activeRepo={activeRepo}
        selectedGitHubItem={selectedGitHubItem}
        selectedGitLabItem={selectedGitLabItem}
        onCloseGitHub={() => setSelectedGitHubItem(null)}
        onCloseGitLab={() => setSelectedGitLabItem(null)}
        onUseGitHub={handleUseGitHubItem}
        onUseGitLab={handleUseGitLabItem}
      />

      <LinearIssueWorkspace
        issue={selectedLinearItem}
        variant="sheet"
        onUse={handleUseLinearItem}
        onOpenIssue={(issue) => setSelectedLinearItem(issue)}
        onClose={() => setSelectedLinearItem(null)}
        sourceContext={linearSourceContext}
      />
    </div>
  )
}
