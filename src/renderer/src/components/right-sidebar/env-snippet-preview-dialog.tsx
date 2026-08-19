import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle, Save, CloudUpload } from 'lucide-react'
import { loader } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { detectLanguage } from '@/lib/language-detect'
import { basename } from '@/lib/path'
import { monaco } from '@/lib/monaco-setup'
import { syncContentToSnippet } from './env-snippet-sync-actions'
import type { Repo } from '../../../../shared/types'

// Why: pin the Monaco loader to the instance Orca already initializes so the
// editors don't lazily boot their own copy (which can render an empty text
// body with only line numbers in this Electron context).
loader.config({ monaco })

// Why: Monaco is heavy; keep it out of the explorer bundle until this dialog opens.
const DiffEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.DiffEditor }))
)

export function EnvSnippetPreviewDialog({
  open,
  onOpenChange,
  filePath,
  relativePath,
  snippetContent,
  connectionId,
  repo,
  worktreePath,
  branch,
  onSynced
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  filePath: string
  relativePath: string
  snippetContent: string
  connectionId: string | null
  repo: Repo
  worktreePath: string
  branch: string
  onSynced: () => void
}): React.JSX.Element | null {
  const [localContent, setLocalContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const diffRef = useRef<editor.IStandaloneDiffEditor | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    setLoading(true)
    setLocalContent(null)
    void window.api.fs
      .readFile({ filePath, connectionId: connectionId ?? undefined })
      .then((result) => {
        if (!cancelled) {
          setLocalContent(result.content)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          // Why: the local file often doesn't exist yet on a different machine
          // before a restore; show the snippet side only, without an error toast.
          if (
            message.includes('ENOENT') ||
            message.includes('no such file') ||
            message.includes('cannot find')
          ) {
            setLocalContent('')
          } else {
            setLocalContent('')
            toast.error(message)
          }
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, filePath, connectionId])

  const themeSetting = useAppStore((s) => s.settings?.theme)
  const theme = useMemo(() => {
    if (themeSetting === 'dark') {
      return 'vs-dark'
    }
    if (themeSetting === 'light') {
      return 'light'
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'light'
  }, [themeSetting])

  const getModifiedContent = (): string => {
    return diffRef.current?.getModifiedEditor().getValue() ?? snippetContent
  }

  const handleSaveLocal = useCallback(async () => {
    setSaving(true)
    try {
      await window.api.fs.writeFile({
        filePath,
        content: getModifiedContent(),
        connectionId: connectionId ?? undefined
      })
      toast.success(
        translate(
          'auto.components.right.sidebar.EnvSnippetSyncSection.savedLocal',
          'Saved {{value0}}',
          { value0: relativePath }
        )
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [connectionId, filePath]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSyncToGitLab = useCallback(async () => {
    setSyncing(true)
    try {
      await syncContentToSnippet(
        { repo, worktreePath, connectionId },
        relativePath,
        branch,
        getModifiedContent()
      )
      toast.success(
        translate(
          'auto.components.right.sidebar.EnvSnippetSyncSection.syncedLocal',
          'Synced {{value0}} to GitLab snippet',
          { value0: relativePath }
        )
      )
      onSynced()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncing(false)
    }
  }, [branch, connectionId, relativePath, repo, worktreePath]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) {
    return null
  }

  const language = detectLanguage(relativePath) || detectLanguage(basename(filePath)) || 'plaintext'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(760px,92vh)] max-h-[min(760px,92vh)] w-[min(1200px,96vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1200px]">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="truncate">
            {translate(
              'auto.components.right.sidebar.EnvSnippetSyncSection.previewTitle',
              'Diff: {{value0}}',
              { value0: relativePath }
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.right.sidebar.EnvSnippetSyncSection.previewDesc',
              'Left: local file · Right: GitLab snippet.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {loading || localContent === null ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              {translate('auto.components.right.sidebar.EnvSnippetSyncSection.loading', 'Loading…')}
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  {translate(
                    'auto.components.right.sidebar.EnvSnippetSyncSection.loading',
                    'Loading…'
                  )}
                </div>
              }
            >
              {/* Why: single Monaco diff widget with the app's already-initialized
                  monaco instance so text bodies render (a mismatched bootstrap
                  earlier showed only gutters). Original = local, modified = snippet. */}
              <DiffEditor
                height="100%"
                language={language}
                original={localContent}
                modified={snippetContent}
                theme={theme}
                onMount={(editorRef) => {
                  diffRef.current = editorRef
                }}
                options={{
                  originalEditable: false,
                  renderSideBySide: true,
                  fontFamily: 'monospace',
                  fontSize: 11,
                  lineHeight: 17,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  renderOverviewRuler: true,
                  renderWhitespace: 'none' as const,
                  padding: { top: 8 }
                }}
              />
            </Suspense>
          )}
        </div>
        <DialogFooter className="border-t border-border/60 bg-muted/10 px-5 py-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={saving || syncing}
            onClick={() => void handleSaveLocal()}
          >
            {saving ? (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            {translate(
              'auto.components.right.sidebar.EnvSnippetSyncSection.saveLocal',
              'Save local'
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={saving || syncing}
            onClick={() => void handleSyncToGitLab()}
          >
            {syncing ? (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            ) : (
              <CloudUpload className="h-3 w-3" />
            )}
            {translate(
              'auto.components.right.sidebar.EnvSnippetSyncSection.syncToGitLab',
              'Sync to GitLab'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
