import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileCode2, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { GitLabSnippet } from '../../../../shared/types'
import { detectRepoIssueProvider } from './repo-issue-provider'
import { getRepoIssueSourceContext } from './issues-panel-rows'
import { GitLabSnippetDialog } from './gitlab-snippet-dialog'

const SNIPPET_LIST_LIMIT = 50

/** Hive→GitLab snippet sync encodes nested paths as a__b for GitLab file names. */
function displaySnippetFileName(fileName: string): string {
  if (!fileName || fileName.includes('/')) {
    return fileName
  }
  return fileName.includes('__') ? fileName.replaceAll('__', '/') : fileName
}

function formatUpdatedAt(value: string): string {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function GitLabSnippetsPanel({
  isVisible
}: {
  isVisible: boolean
}): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const provider = useMemo(() => detectRepoIssueProvider(activeRepo), [activeRepo])

  const [items, setItems] = useState<GitLabSnippet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [selectedSnippet, setSelectedSnippet] = useState<GitLabSnippet | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!activeRepo || provider !== 'gitlab' || !window.api.gl?.listProjectSnippets) {
      setItems([])
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const sourceContext = getRepoIssueSourceContext(activeRepo, 'gitlab')
      const result = await window.api.gl.listProjectSnippets({
        repoPath: activeRepo.path,
        repoId: activeRepo.id,
        sourceContext,
        limit: SNIPPET_LIST_LIMIT
      })
      setItems(result.items)
      if (result.error && result.error.type !== 'not_found') {
        setError(result.error.message)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [activeRepo, provider])

  useEffect(() => {
    if (!isVisible) {
      return
    }
    void refresh()
  }, [isVisible, refresh, refreshNonce])

  useEffect(() => {
    setItems([])
    setError(null)
    setDialogOpen(false)
    setSelectedSnippet(null)
  }, [activeRepo?.id])

  const openCreate = useCallback(() => {
    setDialogMode('create')
    setSelectedSnippet(null)
    setDialogOpen(true)
  }, [])

  const openSnippet = useCallback((snippet: GitLabSnippet) => {
    setDialogMode('edit')
    setSelectedSnippet(snippet)
    setDialogOpen(true)
  }, [])

  const handleSaved = useCallback((snippet: GitLabSnippet) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === snippet.id)
      if (index === -1) {
        return [snippet, ...current]
      }
      const next = current.slice()
      next[index] = {
        ...next[index],
        ...snippet
      }
      return next
    })
    setSelectedSnippet(snippet)
  }, [])

  const handleDeleted = useCallback((snippetId: number) => {
    setItems((current) => current.filter((item) => item.id !== snippetId))
    setSelectedSnippet(null)
  }, [])

  if (!activeRepo) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.GitLabSnippetsPanel.noProject',
          'Open a GitLab project to list its snippets.'
        )}
      </div>
    )
  }

  if (provider !== 'gitlab') {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.GitLabSnippetsPanel.gitlabOnly',
          'Snippets are available for GitLab repositories.'
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="border-b border-sidebar-border px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {translate('auto.components.right.sidebar.GitLabSnippetsPanel.title', 'Snippets')}
            </p>
            <p className="truncate text-xs text-foreground">
              {activeRepo.displayName || activeRepo.path}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-[11px] text-muted-foreground">{items.length}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={loading}
              onClick={openCreate}
              aria-label={translate(
                'auto.components.right.sidebar.GitLabSnippetsPanel.add',
                'Add snippet'
              )}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={loading}
              onClick={() => setRefreshNonce((value) => value + 1)}
              aria-label={translate(
                'auto.components.right.sidebar.GitLabSnippetsPanel.refresh',
                'Refresh snippets'
              )}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            {translate(
              'auto.components.right.sidebar.GitLabSnippetsPanel.loading',
              'Loading snippets…'
            )}
          </div>
        ) : error ? (
          <div className="space-y-2 px-3 py-6 text-center">
            <p className="text-xs text-destructive">{error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRefreshNonce((value) => value + 1)}
            >
              {translate('auto.components.right.sidebar.GitLabSnippetsPanel.retry', 'Retry')}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="space-y-3 px-3 py-6 text-center">
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.right.sidebar.GitLabSnippetsPanel.empty',
                'No project snippets yet.'
              )}
            </p>
            <Button type="button" size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              {translate(
                'auto.components.right.sidebar.GitLabSnippetsPanel.addFirst',
                'New snippet'
              )}
            </Button>
          </div>
        ) : (
          <ul className="py-1">
            {items.map((snippet) => (
              <li key={snippet.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
                  onClick={() => openSnippet(snippet)}
                >
                  <FileCode2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{snippet.title}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[
                        displaySnippetFileName(snippet.fileName) || null,
                        snippet.visibility,
                        snippet.authorUsername ? `@${snippet.authorUsername}` : null,
                        formatUpdatedAt(snippet.updatedAt) || null
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {snippet.description ? (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {snippet.description}
                      </p>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <GitLabSnippetDialog
        open={dialogOpen}
        mode={dialogMode}
        repo={activeRepo}
        snippet={selectedSnippet}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  )
}
