/**
 * Issue list fetching for the Issues panel: GitHub/GitLab via IPC, Linear via
 * the store's project-issue cache. The merged 'all' tab combines the repo's
 * remote provider rows with Linear rows (newest first).
 */
import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { observeLinearIssueRead } from '@/store/slices/linear/linear-issue-publication'
import { normalizeTaskSourceContext } from '../../../../../../shared/task-source-context'
import type { GitLabWorkItem, Repo } from '../../../../../../shared/types'
import type { LinearRepoBinding } from '../../../../../../shared/linear-repo-binding'
import type { RepoIssueProvider } from './repo-issue-provider'
import {
  GITHUB_OPEN_ISSUES_QUERY,
  ISSUE_LIST_LIMIT,
  getRepoIssueSourceContext,
  toGitHubIssueRows,
  toGitLabIssueRows,
  toLinearIssueRows,
  type IssueRow
} from './issues-panel-rows'

export type IssuesProviderTab = 'all' | 'github' | 'gitlab' | 'linear'

type LinearBinding = LinearRepoBinding | null

export function useIssueRowsFetch(args: {
  isVisible: boolean
  repo: Repo | null
  provider: RepoIssueProvider | null
  activeTab: IssuesProviderTab
  linearBinding: LinearBinding
}): {
  rows: IssueRow[]
  setRows: React.Dispatch<React.SetStateAction<IssueRow[]>>
  loading: boolean
  error: string | null
  refreshNonce: number
  bumpRefresh: () => void
  linearSourceContext: ReturnType<typeof getRepoIssueSourceContext>
} {
  const { isVisible, repo: activeRepo, provider, activeTab, linearBinding } = args
  const [rows, setRows] = useState<IssueRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const fetchWorkItems = useAppStore((s) => s.fetchWorkItems)
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
    let releaseLinearRead: (() => void) | null = null

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
      // Why: the merged 'all' tab combines the repo's remote provider rows
      // with Linear rows; single-provider tabs fetch exactly one source.
      const wantGithub = activeTab === 'github' || (activeTab === 'all' && provider === 'github')
      const wantGitlab = activeTab === 'gitlab' || (activeTab === 'all' && provider === 'gitlab')
      const wantLinear = activeTab === 'all' && Boolean(linearBinding)
      let remoteRows: IssueRow[] | null = null
      let linearRows: IssueRow[] | null = wantLinear ? [] : null
      const apply = (): void => {
        if (remoteRows === null) {
          return
        }
        if (linearRows === null) {
          setRows(remoteRows)
          return
        }
        const merged = [...remoteRows, ...linearRows].sort((a, b) => {
          const at = a.updatedAt ? Date.parse(a.updatedAt) : 0
          const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0
          return bt - at
        })
        setRows(merged)
      }
      try {
        if (wantGithub) {
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
          remoteRows = toGitHubIssueRows(items ?? [])
        } else if (wantGitlab) {
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
          }
          remoteRows = toGitLabIssueRows(result.items, activeRepo.id)
        } else {
          remoteRows = []
        }
        apply()
        if (!wantLinear && !cancelled) {
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setRows([])
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
        return
      }
      if (wantLinear && linearBinding && !cancelled) {
        const read = listLinearProjectIssues(
          linearBinding.projectId,
          linearBinding.workspaceId,
          ISSUE_LIST_LIMIT,
          { force: refreshNonce > 0, sourceContext: linearSourceContext }
        )
        releaseLinearRead = observeLinearIssueRead(
          read,
          () => !cancelled,
          (_lease, view) => {
            if (cancelled) {
              return
            }
            if (view.kind === 'loading') {
              return
            }
            // Why: a Linear failure must not blank the merged list — keep the
            // remote rows and surface the remote error only.
            linearRows = view.kind === 'error' ? [] : toLinearIssueRows(view.data?.items ?? [])
            apply()
            if (!cancelled) {
              setLoading(false)
            }
          }
        )
      }
    })()

    return () => {
      cancelled = true
      releaseLinearRead?.()
    }
  }, [
    activeRepo,
    activeTab,
    fetchWorkItems,
    isVisible,
    linearBinding,
    linearSourceContext,
    listLinearProjectIssues,
    provider,
    refreshNonce
  ])

  // Why: Linear reads go through the store (workspace/project caches) rather
  // than the gh/gl IPC namespaces, so they live in their own effect.
  useEffect(() => {
    // Why: the merged 'all' tab owns its rows in the remote-fetch effect; the
    // linear-only effect must not clobber them.
    if (activeTab !== 'linear') {
      return
    }
    let cancelled = false
    if (!isVisible || !activeRepo || !linearBinding) {
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

  return {
    rows,
    setRows,
    loading,
    error,
    refreshNonce,
    bumpRefresh: () => setRefreshNonce((value) => value + 1),
    linearSourceContext
  }
}
