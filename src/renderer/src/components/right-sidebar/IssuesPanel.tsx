import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import type { GitHubWorkItem, GitLabWorkItem, TuiAgent } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { launchIssueAiPlanCommenter } from './issues-panel-ai-plan'
import { launchIssueAiWorker, type IssueAiWorkMode } from './issues-panel-ai-work'
import { confirmCloseIssue } from './issues-panel-close-confirm'
import { closeRepoIssue, createRepoIssue } from './issues-panel-create-actions'
import { IssuesPanelCreateDialog, type CreateIssueSubmitInput } from './issues-panel-create-dialog'
import { IssuesPanelDetailModals } from './issues-panel-detail-modals'
import { IssuesPanelEmpty } from './issues-panel-empty'
import { IssuesPanelList } from './issues-panel-list'
import {
  startGitHubIssueFromPanel,
  startGitLabIssueFromPanel
} from './issues-panel-workspace-actions'
import { detectRepoIssueProvider } from './repo-issue-provider'
import {
  getRepoIssueSourceContext,
  GITHUB_OPEN_ISSUES_QUERY,
  ISSUE_LIST_LIMIT,
  toGitHubIssueRows,
  toGitLabIssueRows,
  type IssueRow
} from './issues-panel-rows'

export default function IssuesPanel({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const fetchWorkItems = useAppStore((s) => s.fetchWorkItems)
  const openModal = useAppStore((s) => s.openModal)
  const confirm = useConfirmationDialog()

  const provider = useMemo(() => detectRepoIssueProvider(activeRepo), [activeRepo])
  const [rows, setRows] = useState<IssueRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [selectedGitHubItem, setSelectedGitHubItem] = useState<GitHubWorkItem | null>(null)
  const [selectedGitLabItem, setSelectedGitLabItem] = useState<GitLabWorkItem | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [aiPlanningIssueId, setAiPlanningIssueId] = useState<string | null>(null)
  const [aiWorkingIssueId, setAiWorkingIssueId] = useState<string | null>(null)
  const [closingIssueId, setClosingIssueId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (!isVisible || !activeRepo || !provider) {
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
        if (provider === 'github') {
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
  }, [activeRepo, fetchWorkItems, isVisible, provider, refreshNonce])

  // Why: switching worktrees/repos must not keep a detail dialog for the old repo.
  useEffect(() => {
    setSelectedGitHubItem(null)
    setSelectedGitLabItem(null)
    setCreateOpen(false)
    setAiPlanningIssueId(null)
    setAiWorkingIssueId(null)
    setClosingIssueId(null)
  }, [activeRepo?.id])

  const providerLabel =
    provider === 'github'
      ? translate('auto.i18n.hostedReview.copy.c7d1e5f9a8', 'GitHub')
      : provider === 'gitlab'
        ? translate('auto.i18n.hostedReview.copy.91b5c8d7e6', 'GitLab')
        : null

  const openIssue = useCallback((row: IssueRow) => {
    if (row.provider === 'github' && row.githubItem) {
      setSelectedGitLabItem(null)
      setSelectedGitHubItem(row.githubItem)
      return
    }
    if (row.provider === 'gitlab' && row.gitlabItem) {
      setSelectedGitHubItem(null)
      setSelectedGitLabItem(row.gitlabItem)
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
            title: row.title,
            url: row.url
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
            title: row.title,
            url: row.url
          }
        })
      } finally {
        setAiWorkingIssueId((current) => (current === row.id ? null : current))
      }
    },
    [activeRepo, activeWorktree]
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
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setClosingIssueId((current) => (current === row.id ? null : current))
      }
    },
    [activeRepo, confirm, selectedGitHubItem?.id, selectedGitLabItem?.id]
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

  const handleCreateIssue = useCallback(
    async (input: CreateIssueSubmitInput) => {
      if (!activeRepo || !provider) {
        return
      }
      setCreateSubmitting(true)
      try {
        const created = await createRepoIssue({
          provider,
          repo: activeRepo,
          input
        })
        if (!created) {
          return
        }
        setCreateOpen(false)
        if (created.provider === 'github') {
          setSelectedGitHubItem(created.item)
        } else {
          setSelectedGitLabItem(created.item)
        }
        setRefreshNonce((value) => value + 1)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setCreateSubmitting(false)
      }
    },
    [activeRepo, provider]
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

  if (!provider) {
    return (
      <IssuesPanelEmpty
        title={translate(
          'auto.components.right.sidebar.issuesPanel.unsupportedTitle',
          'Issues unavailable'
        )}
        description={translate(
          'auto.components.right.sidebar.issuesPanel.unsupportedBody',
          'This repo is not linked to GitHub or GitLab yet. Orca auto-detects issues from the git remote.'
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
            {providerLabel}
            {activeRepo.displayName ? ` · ${activeRepo.displayName}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
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
        </div>
      </div>

      {error ? (
        <div className="border-b border-border px-3 py-2 text-xs text-destructive">{error}</div>
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
          onOpenIssue={openIssue}
          onAskAiPlan={(row, agent) => {
            void handleAskAiPlan(row, agent)
          }}
          onAskAiWork={(row, agent, mode) => {
            void handleAskAiWork(row, agent, mode)
          }}
          repoId={activeRepo?.id ?? null}
          onCloseIssue={(row) => {
            void handleCloseIssue(row)
          }}
        />
      </div>

      <IssuesPanelCreateDialog
        open={createOpen}
        provider={provider}
        repoLabel={activeRepo.displayName || activeRepo.path}
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
    </div>
  )
}
