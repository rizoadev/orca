import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { ChevronRight, ChevronDown, LoaderCircle, KeyRound, RefreshCw } from 'lucide-react'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { useRuntimeFileListForWorktree } from '@/components/quick-open-file-list'
import { useActiveWorktree } from '@/store/selectors'
import { branchName } from '@/lib/git-utils'
import { detectRepoIssueProvider } from './repo-issue-provider'
import { getRepoIssueSourceContext } from './issues-panel-rows'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import type { Repo, GitLabSnippet } from '../../../../shared/types'
import { cn } from '@/lib/utils'
import {
  isEnvFileName,
  parseSnippetTitle,
  relativePathFromSnippetTitle,
  snippetMatchesBranch
} from './env-snippet-sync-encoding'
import { useEnvSnippetSyncActions } from './use-env-snippet-sync-actions'
import { EnvSnippetSyncList, type SyncRow, type SyncStatus } from './env-snippet-sync-list'
import {
  EnvSnippetSyncExtras,
  isRepoNotAttachedError,
  type SnippetPreview
} from './env-snippet-sync-extras'
import { publishSyncedSnippets, clearSyncedSnippets } from './env-snippet-sync-store'

export function EnvSnippetSyncSection({
  worktreePath,
  activeWorktreeId,
  connectionId,
  repo,
  isVisible
}: {
  worktreePath: string
  activeWorktreeId: string | null
  connectionId: string | null
  repo: Repo
  isVisible: boolean
}): React.JSX.Element | null {
  const activeWorktree = useActiveWorktree()
  const branch = useMemo(() => branchName(activeWorktree?.branch ?? ''), [activeWorktree])
  const provider = useMemo(() => detectRepoIssueProvider(repo), [repo])
  const [liveIsGitLab, setLiveIsGitLab] = useState(false)
  const [open, setOpen] = useState(false)
  const [snippets, setSnippets] = useState<GitLabSnippet[]>([])
  const [loadingSnippets, setLoadingSnippets] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attaching, setAttaching] = useState(false)
  const [preview, setPreview] = useState<SnippetPreview | null>(null)
  const [syncStatusByPath, setSyncStatusByPath] = useState<Record<string, SyncStatus>>({})
  const mountedRef = useRef(true)
  const isGitLab = provider === 'gitlab' || liveIsGitLab

  // Why: folder workspaces are never enriched with a git remote identity, so
  // metadata-only provider detection stays null for GitLab folder projects.
  // Probe the live git remote as a fallback so .env sync still activates.
  useEffect(() => {
    if (provider === 'gitlab' || !worktreePath || !window.api.repos?.detectRemoteIdentity) {
      return
    }
    let cancelled = false
    void window.api.repos
      .detectRemoteIdentity({ path: worktreePath, connectionId })
      .then((identity) => {
        if (cancelled || !identity) {
          return
        }
        const host = identity.canonicalKey?.trim().toLowerCase().split('/')[0] ?? ''
        const url = (identity.remoteUrl ?? '').toLowerCase()
        setLiveIsGitLab(host === 'gitlab.com' || host.includes('gitlab') || url.includes('gitlab'))
      })
      .catch(() => {
        /* best-effort probe; non-git folders simply stay inactive */
      })
    return () => {
      cancelled = true
    }
  }, [connectionId, provider, worktreePath])

  const fileList = useRuntimeFileListForWorktree({
    enabled: open && activeWorktreeId !== null,
    worktreeId: activeWorktreeId
  })

  const envFiles = useMemo(() => {
    if (!worktreePath) {
      return []
    }
    // Why: useRuntimeFileListForWorktree returns root-relative paths (same
    // convention as FileExplorer's name-filter projection), so they are both
    // the display label and the path to join against worktreePath for I/O.
    return fileList.files
      .filter((p) => isEnvFileName(basename(p)))
      .sort((a, b) => a.localeCompare(b))
  }, [fileList.files, worktreePath])

  const loadSnippets = useCallback(async () => {
    if (!isGitLab || !window.api.gl?.listProjectSnippets) {
      return
    }
    setLoadingSnippets(true)
    try {
      const result = await window.api.gl.listProjectSnippets({
        repoPath: repo.path,
        repoId: repo.id,
        sourceContext: getRepoIssueSourceContext(repo, 'gitlab'),
        limit: 100
      })
      if (!mountedRef.current) {
        return
      }
      if (result.error) {
        setLoadError(result.error.message ?? String(result.error))
        setSnippets([])
        return
      }
      setLoadError(null)
      const envSnippets = (result.items as GitLabSnippet[]).filter((s) => {
        const parsed = parseSnippetTitle(s.title)
        return parsed !== null && snippetMatchesBranch(parsed.branch, branch)
      })
      setSnippets(envSnippets)
      publishSyncedSnippets(worktreePath, branch, envSnippets)
    } catch (err) {
      if (!mountedRef.current) {
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      setLoadError(message)
      toast.error(message)
    } finally {
      if (mountedRef.current) {
        setLoadingSnippets(false)
      }
    }
  }, [branch, isGitLab, repo, worktreePath])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Why: depend on primitive keys, not on the loadSnippets function identity.
  // repo is a freshly-built object on many store writes (git-status refresh,
  // repos:changed echoes), so listing loadSnippets here would refetch the
  // GitLab API on every such re-render instead of only when the repo/worktree
  // actually changes.
  const loadSnippetsRef = useRef(loadSnippets)
  loadSnippetsRef.current = loadSnippets

  useEffect(() => {
    if ((!open && !isVisible) || !isGitLab) {
      return
    }
    void loadSnippetsRef.current()
  }, [open, isVisible, isGitLab, branch, repo.id, worktreePath])

  // Reset snippets when repo/worktree changes.
  useEffect(() => {
    setSnippets([])
    setLoadError(null)
    clearSyncedSnippets(worktreePath, branch)
  }, [repo.id, worktreePath, branch])

  const snippetLookup = useMemo(() => {
    const map = new Map<string, GitLabSnippet[]>()
    for (const snippet of snippets) {
      const relPath = relativePathFromSnippetTitle(snippet.title)
      if (relPath) {
        const list = map.get(relPath) ?? []
        list.push(snippet)
        map.set(relPath, list)
      }
    }
    return map
  }, [snippets])

  const setPathStatus = useCallback((relativePath: string, status: SyncStatus) => {
    setSyncStatusByPath((prev) => ({ ...prev, [relativePath]: status }))
  }, [])

  const { handleUpload, handleDownload, handleDelete, handlePreview, handleAttach } =
    useEnvSnippetSyncActions({
      repo,
      worktreePath,
      connectionId,
      branch,
      isGitLab,
      setPathStatus,
      loadSnippets,
      setSnippets,
      setPreview,
      setAttaching,
      setLoadError
    })

  const syncedCount = envFiles.filter((f) => {
    return (snippetLookup.get(f)?.length ?? 0) > 0
  }).length

  // Why: show every snippet GitLab holds for the current branch (their files may
  // not exist locally yet), plus local .env files that are not yet uploaded.
  // Duplicate paths render one row per snippet so each can be deleted/reused.
  const rows = useMemo<SyncRow[]>(() => {
    const out: SyncRow[] = []
    for (const rel of envFiles) {
      const list = snippetLookup.get(rel)
      if (list && list.length > 0) {
        for (const s of list) {
          out.push({ relativePath: rel, localFile: true, snippet: s })
        }
      } else {
        out.push({ relativePath: rel, localFile: true })
      }
    }
    for (const [rel, list] of snippetLookup) {
      if (envFiles.includes(rel)) {
        continue
      }
      for (const s of list) {
        out.push({ relativePath: rel, localFile: false, snippet: s })
      }
    }
    return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  }, [envFiles, snippetLookup])

  return (
    <div className="shrink-0 border-t border-sidebar-border bg-sidebar">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="group flex items-center gap-0.5 pr-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {translate(
                  'auto.components.right.sidebar.EnvSnippetSyncSection.header',
                  '.env Snippets'
                )}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {isGitLab && (open || rows.length > 0) ? `${syncedCount}/${rows.length}` : '—'}
              </span>
            </button>
          </CollapsibleTrigger>
          {isGitLab ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              disabled={loadingSnippets}
              onClick={() => void loadSnippets()}
              title={translate(
                'auto.components.right.sidebar.EnvSnippetSyncSection.reload',
                'Reload snippets'
              )}
            >
              <RefreshCw className={cn('h-3 w-3', loadingSnippets && 'animate-spin')} />
            </Button>
          ) : null}
        </div>
        <CollapsibleContent>
          <div className="max-h-48 overflow-y-auto scrollbar-sleek px-1 pb-2">
            {!isGitLab ? (
              <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.right.sidebar.EnvSnippetSyncSection.gitlabOnly',
                  'Requires a GitLab repository.'
                )}
              </div>
            ) : loadingSnippets && envFiles.length === 0 ? (
              <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                <LoaderCircle className="mx-auto mb-1 h-3.5 w-3.5 animate-spin" />
                {translate(
                  'auto.components.right.sidebar.EnvSnippetSyncSection.loading',
                  'Loading…'
                )}
              </div>
            ) : loadingSnippets && rows.length === 0 ? (
              <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                <LoaderCircle className="mx-auto mb-1 h-3.5 w-3.5 animate-spin" />
                {translate(
                  'auto.components.right.sidebar.EnvSnippetSyncSection.loading',
                  'Loading…'
                )}
              </div>
            ) : rows.length === 0 ? (
              <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.right.sidebar.EnvSnippetSyncSection.noEnvFiles',
                  'No .env files found.'
                )}
              </div>
            ) : (
              <EnvSnippetSyncList
                rows={rows}
                syncStatusByPath={syncStatusByPath}
                onUpload={(rel) => void handleUpload(rel)}
                onRestore={(snippet) => void handleDownload(snippet)}
                onPreview={(snippet) => void handlePreview(snippet)}
                onDelete={(snippet) => void handleDelete(snippet)}
                onOpen={(url) => void window.api.shell.openUrl(url)}
              />
            )}
            {isGitLab && isRepoNotAttachedError(loadError) ? (
              <div className="flex flex-col items-center gap-1.5 px-3 py-3">
                <p className="text-center text-[11px] text-muted-foreground">
                  {translate(
                    'auto.components.right.sidebar.EnvSnippetSyncSection.attachHint',
                    'Attach this project as a GitLab repo to sync snippets.'
                  )}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={attaching}
                  onClick={() => void handleAttach()}
                >
                  {attaching ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <KeyRound className="h-3.5 w-3.5" />
                  )}
                  {translate(
                    'auto.components.right.sidebar.EnvSnippetSyncSection.attach',
                    'Attach GitLab repo'
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
      <EnvSnippetSyncExtras
        showAttach={isGitLab && isRepoNotAttachedError(loadError)}
        attaching={attaching}
        onAttach={() => void handleAttach()}
        preview={preview}
        onClosePreview={() => setPreview(null)}
        connectionId={connectionId}
        repo={repo}
        worktreePath={worktreePath}
        branch={branch}
        onSynced={() => void loadSnippets()}
      />
    </div>
  )
}
