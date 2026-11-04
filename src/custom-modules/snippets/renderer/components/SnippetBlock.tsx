import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  LoaderCircle,
  KeyRound,
  RefreshCw,
  Download,
  Trash2,
  Eye,
  GitBranch
} from 'lucide-react'
import { toast } from 'sonner'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { joinPath } from '@/lib/path'
import { branchName } from '@/lib/git-utils'
import { translate } from '@/i18n/i18n'
import type { GitLabSnippet } from '../../shared/types'
import { parseSnippetTitle, snippetMatchesBranch } from './snippet-encoding'
import { SnippetPreviewModal } from './SnippetPreviewModal'

type SnippetBlockProps = {
  worktreePath: string
  branch: string
  repoId: string
  connectionId: string | null
}

export function SnippetBlock({ worktreePath, branch, repoId, connectionId }: SnippetBlockProps) {
  const [open, setOpen] = useState(false)
  const [allSnippets, setAllSnippets] = useState<GitLabSnippet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewSnippet, setPreviewSnippet] = useState<GitLabSnippet | null>(null)
  const confirm = useConfirmationDialog()

  // Current branch name, normalised (strip refs/heads/)
  const currentBranch = branchName(branch)

  // Collect all known branches for this repo from the store
  const repoBranches = useAppStore((s) => {
    const worktrees = s.worktreesByRepo[repoId] ?? []
    const names = worktrees
      .map((w) => branchName(w.branch ?? ''))
      .filter((b) => b && b !== 'HEAD')
    // De-duplicate, keep current branch first
    const seen = new Set<string>()
    const result: string[] = []
    for (const b of [currentBranch, ...names]) {
      if (b && !seen.has(b)) {
        seen.add(b)
        result.push(b)
      }
    }
    return result
  })

  // Selected branch — default to current branch
  const [selectedBranch, setSelectedBranch] = useState<string>(currentBranch)

  // Sync selectedBranch when the active branch changes (e.g. user switches worktree)
  useEffect(() => {
    setSelectedBranch(currentBranch)
  }, [currentBranch])

  // Snippets filtered by selectedBranch
  const snippets = useMemo(
    () =>
      allSnippets.filter((s) => {
        const parsed = parseSnippetTitle(s.title)
        return parsed !== null && snippetMatchesBranch(parsed.branch, selectedBranch)
      }),
    [allSnippets, selectedBranch]
  )

  const loadSnippets = useCallback(async () => {
    if (!window.api.gl?.listProjectSnippets) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.gl.listProjectSnippets({
        repoPath: worktreePath,
        repoId,
        limit: 100
      })
      if (result.error) {
        setError(result.error.message ?? String(result.error))
        setAllSnippets([])
        return
      }
      // Store ALL snippets — filtering by branch is done in useMemo above
      setAllSnippets(result.items as GitLabSnippet[])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [worktreePath, repoId])

  useEffect(() => {
    if (open) {
      void loadSnippets()
    }
  }, [open, loadSnippets])

  // ── Delete snippet from GitLab ──────────────────────────────
  const handleDelete = useCallback(
    async (snippet: GitLabSnippet) => {
      const parsed = parseSnippetTitle(snippet.title)
      const displayName = parsed?.relativePath ?? snippet.fileName
      const confirmed = await confirm({
        title: 'Delete snippet',
        description: `Delete "${displayName}" from GitLab? This cannot be undone.`,
        confirmLabel: 'Delete',
        confirmVariant: 'destructive',
        icon: Trash2
      })
      if (!confirmed) {
        return
      }
      const toastId = toast.loading('Deleting snippet…', { description: displayName })
      try {
        const result = await window.api.gl.deleteProjectSnippet({
          repoPath: worktreePath,
          repoId,
          snippetId: snippet.id
        })
        if (result.ok) {
          toast.success('Snippet deleted', { id: toastId, description: displayName })
          setAllSnippets((prev) => prev.filter((s) => s.id !== snippet.id))
        } else {
          toast.error('Failed to delete snippet', { id: toastId, description: result.error })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error('Failed to delete snippet', { id: toastId, description: msg })
      }
    },
    [confirm, worktreePath, repoId]
  )

  // ── Download snippet from GitLab to local path ──────────────
  const handleDownload = useCallback(
    async (snippet: GitLabSnippet) => {
      const parsed = parseSnippetTitle(snippet.title)
      const relativePath = parsed?.relativePath ?? snippet.fileName
      if (!relativePath) {
        toast.error('Cannot resolve file path from snippet title')
        return
      }
      const localPath = joinPath(worktreePath, relativePath)
      const toastId = toast.loading('Downloading snippet…', { description: relativePath })
      try {
        const detail = await window.api.gl.getProjectSnippet({
          repoPath: worktreePath,
          repoId,
          snippetId: snippet.id
        })
        if (!detail.ok || !detail.snippet) {
          toast.error('Failed to fetch snippet', { id: toastId, description: detail.error })
          return
        }
        const writeResult = await window.api.fs.writeFile({
          filePath: localPath,
          content: detail.snippet.content,
          connectionId: connectionId ?? undefined
        })
        if (writeResult.ok) {
          toast.success('Snippet downloaded', { id: toastId, description: relativePath })
        } else {
          toast.error('Failed to write file', {
            id: toastId,
            description: `Conflict: ${writeResult.diskConflict}`
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error('Failed to download snippet', { id: toastId, description: msg })
      }
    },
    [worktreePath, repoId, connectionId]
  )

  // ── Open preview modal ──────────────────────────────────────
  const handlePreview = useCallback((snippet: GitLabSnippet) => {
    setPreviewSnippet(snippet)
  }, [])

  const isViewingOtherBranch = selectedBranch !== currentBranch

  return (
    <>
      <div className="shrink-0 border-t border-sidebar-border bg-sidebar">
        <Collapsible open={open} onOpenChange={setOpen}>
          {/* ── Header ── */}
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
                  {translate('custom.snippets', 'GitLab Snippets')}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {snippets.length > 0 ? snippets.length : '—'}
                </span>
              </button>
            </CollapsibleTrigger>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              disabled={loading}
              onClick={() => void loadSnippets()}
              title="Reload snippets"
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            </Button>
          </div>

          <CollapsibleContent>
            {/* ── Branch selector ── */}
            <div className="flex items-center gap-1.5 px-2 pb-1 pt-0.5">
              <GitBranch
                className={cn(
                  'h-3 w-3 shrink-0',
                  isViewingOtherBranch ? 'text-amber-500' : 'text-muted-foreground'
                )}
              />
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger
                  className={cn(
                    'h-5 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[11px] shadow-none focus:ring-0',
                    isViewingOtherBranch ? 'text-amber-500' : 'text-muted-foreground'
                  )}
                >
                  <SelectValue placeholder="Select branch…" />
                </SelectTrigger>
                <SelectContent>
                  {repoBranches.map((b) => (
                    <SelectItem key={b} value={b} className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <GitBranch className="h-3 w-3 shrink-0" />
                        {b}
                        {b === currentBranch && (
                          <span className="text-muted-foreground">(current)</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── Snippet list ── */}
            <div className="max-h-48 overflow-y-auto scrollbar-sleek px-1 pb-2">
              {loading && allSnippets.length === 0 ? (
                <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                  <LoaderCircle className="mx-auto mb-1 h-3.5 w-3.5 animate-spin" />
                  {translate('custom.loading', 'Loading…')}
                </div>
              ) : error ? (
                <div className="px-3 py-3 text-center text-[11px] text-destructive">{error}</div>
              ) : snippets.length === 0 ? (
                <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                  {isViewingOtherBranch
                    ? `No snippets for branch "${selectedBranch}"`
                    : translate('custom.noSnippets', 'No snippets found for this branch')}
                </div>
              ) : (
                <div className="space-y-1">
                  {snippets.map((snippet) => {
                    const parsed = parseSnippetTitle(snippet.title)
                    const displayName = parsed?.relativePath ?? snippet.fileName
                    return (
                      <div
                        key={snippet.id}
                        className="group flex items-center gap-1.5 rounded px-2 py-1.5 hover:bg-sidebar-accent"
                      >
                        <KeyRound className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-[11px]" title={displayName}>
                          {displayName}
                        </span>
                        <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => handlePreview(snippet)}
                            title="Preview diff"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => void handleDownload(snippet)}
                            title="Download to local"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => void handleDelete(snippet)}
                            title="Delete from GitLab"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <SnippetPreviewModal
        snippet={previewSnippet}
        worktreePath={worktreePath}
        connectionId={connectionId}
        onClose={() => setPreviewSnippet(null)}
      />
    </>
  )
}
