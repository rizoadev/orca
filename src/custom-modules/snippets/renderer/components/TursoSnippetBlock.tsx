import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  LoaderCircle,
  Database,
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
import { parseSnippetTitle } from './snippet-encoding'
import type { TursoSnippet } from '../../../../shared/turso/turso-snippet-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { TursoSnippetPreviewModal } from './TursoSnippetPreviewModal'

const EMPTY_WORKTREES: Worktree[] = []

type TursoSnippetBlockProps = {
  worktreePath: string
  branch: string
  repoId: string
  connectionId: string | null
}

export function TursoSnippetBlock({
  worktreePath,
  branch,
  repoId,
  connectionId
}: TursoSnippetBlockProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [allSnippets, setAllSnippets] = useState<TursoSnippet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewSnippet, setPreviewSnippet] = useState<TursoSnippet | null>(null)
  const confirm = useConfirmationDialog()

  const settings = useAppStore((s) => s.settings)
  const url = settings?.tursoDatabaseUrl?.trim() ?? ''
  const authToken = settings?.tursoAuthToken?.trim() ?? ''
  const configured = url !== '' && authToken !== ''

  const currentBranch = branchName(branch)

  // Why: selector must return a stable reference or zustand re-renders every tick.
  const worktrees = useAppStore((s) => s.worktreesByRepo[repoId] ?? EMPTY_WORKTREES)

  const repoBranches = useMemo(() => {
    const names = worktrees.map((w) => branchName(w.branch ?? '')).filter((b) => b && b !== 'HEAD')
    const seen = new Set<string>()
    const result: string[] = []
    for (const b of [currentBranch, ...names]) {
      if (b && !seen.has(b)) {
        seen.add(b)
        result.push(b)
      }
    }
    return result
  }, [worktrees, currentBranch])

  const [selectedBranch, setSelectedBranch] = useState<string>(currentBranch)

  useEffect(() => {
    setSelectedBranch(currentBranch)
  }, [currentBranch])

  const snippets = useMemo(
    () => allSnippets.filter((s) => s.branch === selectedBranch),
    [allSnippets, selectedBranch]
  )

  const loadSnippets = useCallback(async () => {
    if (!configured || !window.api.turso?.listSnippets) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.turso.listSnippets({ url, authToken, repoId })
      if (result.ok) {
        setAllSnippets(result.items)
      } else {
        setError(result.error)
        setAllSnippets([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [configured, url, authToken, repoId])

  useEffect(() => {
    if (open) {
      void loadSnippets()
    }
  }, [open, loadSnippets])

  const handleDelete = useCallback(
    async (snippet: TursoSnippet) => {
      const confirmed = await confirm({
        title: 'Delete snippet',
        description: `Delete "${snippet.title}" from Turso? This cannot be undone.`,
        confirmLabel: 'Delete',
        confirmVariant: 'destructive',
        icon: Trash2
      })
      if (!confirmed) {
        return
      }
      const toastId = toast.loading('Deleting snippet…', { description: snippet.title })
      try {
        const result = await window.api.turso.deleteSnippet({
          url,
          authToken,
          snippetId: snippet.id
        })
        if (result.ok) {
          toast.success('Snippet deleted', { id: toastId, description: snippet.title })
          setAllSnippets((prev) => prev.filter((s) => s.id !== snippet.id))
        } else {
          toast.error('Failed to delete snippet', { id: toastId, description: result.error })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.error('Failed to delete snippet', { id: toastId, description: msg })
      }
    },
    [confirm, url, authToken]
  )

  const handleDownload = useCallback(
    async (snippet: TursoSnippet) => {
      // fileName encodes '/' as '__'; the title carries the real relative path.
      const relativePath =
        parseSnippetTitle(snippet.title)?.relativePath ?? snippet.fileName.replace(/__/g, '/')
      const localPath = joinPath(worktreePath, relativePath)
      const toastId = toast.loading('Downloading snippet…', { description: relativePath })
      try {
        const writeResult = await window.api.fs.writeFile({
          filePath: localPath,
          content: snippet.content,
          connectionId: connectionId ?? undefined
        })
        if (writeResult.ok) {
          toast.success('Snippet downloaded', { id: toastId, description: snippet.fileName })
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
    [worktreePath, connectionId]
  )

  const isViewingOtherBranch = selectedBranch !== currentBranch

  if (!configured) {
    return null
  }

  return (
    <>
      <div className="shrink-0 border-t border-sidebar-border bg-sidebar">
        <Collapsible open={open} onOpenChange={setOpen}>
          {/* ── Header ── */}
          <div className="group flex items-center gap-0.5 pr-1">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-sidebar-accent"
              >
                {open ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {translate('custom.tursoSnippets', 'Turso Snippets')}
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
            <div className="flex items-center gap-1.5 px-2 py-0.5">
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger
                  className={cn(
                    'h-4 min-w-0 flex-1 border-0 bg-transparent px-1.5 py-0 text-[11px] shadow-none focus:ring-0 [&_svg]:size-3',
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
            <div className="max-h-48 overflow-y-auto scrollbar-sleek px-2 pb-1.5">
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
                    ? `No Turso snippets for branch "${selectedBranch}"`
                    : translate(
                        'custom.noTursoSnippets',
                        'No Turso snippets found for this branch'
                      )}
                </div>
              ) : (
                <div className="space-y-1">
                  {snippets.map((snippet) => (
                    <div
                      key={snippet.id}
                      className="group flex items-center gap-1.5 rounded px-2 py-1 hover:bg-sidebar-accent"
                    >
                      <Database className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[11px]" title={snippet.title}>
                        {snippet.title}
                      </span>
                      <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => setPreviewSnippet(snippet)}
                          title="Preview content"
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
                          title="Delete from Turso"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {previewSnippet ? (
        <TursoSnippetPreviewModal
          snippet={previewSnippet}
          worktreePath={worktreePath}
          connectionId={connectionId}
          onClose={() => setPreviewSnippet(null)}
        />
      ) : null}
    </>
  )
}
