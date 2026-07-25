import { lazy, Suspense, useState, useCallback } from 'react'
import { ExternalLink, LoaderCircle, Code, FileText } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { detectLanguage } from '@/lib/language-detect'
import { computeEditorFontSize, resolveEditorFontFamily } from '@/lib/editor-font-zoom'
import { SnippetRichMarkdownEditor } from './snippet-rich-markdown-editor'
import type { GitLabSnippetVisibility } from '../../../../shared/types'

// Why: lazy-load Monaco so the snippet dialog doesn't pull in the full
// editor bundle on pages that never open it.
const MonacoEditorLazy = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.default }))
)

export type SnippetDraft = {
  title: string
  fileName: string
  description: string
  visibility: GitLabSnippetVisibility
  content: string
}

/** Returns true when fileName ends with .md or .mdx */
function isMarkdownFile(fileName: string): boolean {
  return /\.(md|mdx)$/i.test(fileName.trim())
}

export function GitLabSnippetDialogForm({
  draft,
  dirty,
  webUrl,
  loading,
  saving,
  deleting,
  loadError,
  mode,
  onDraftChange
}: {
  draft: SnippetDraft
  language?: string
  dirty: boolean
  webUrl: string
  loading: boolean
  saving: boolean
  deleting: boolean
  loadError: string | null
  isDark?: boolean
  editorFontSize?: number
  editorFontFamily?: string
  mode: 'create' | 'edit'
  onDraftChange: (patch: Partial<SnippetDraft>) => void
  onEditorMount?: unknown
}): React.JSX.Element {
  const disabled = loading || saving || deleting
  const descriptionText = draft.description.trim()
  const isMd = isMarkdownFile(draft.fileName)

  // Track whether user prefers rich-md or source view for .md files.
  // Default is 'source' (Monaco) since textarea was previous default.
  const [mdViewMode, setMdViewMode] = useState<'source' | 'rich'>('source')

  const settings = useAppStore((s) => s.settings)
  const isDark =
    settings?.theme === 'dark' ||
    (settings?.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const editorFontSize = computeEditorFontSize(
    settings?.terminalFontSize ?? 13,
    0
  )
  const editorFontFamily = resolveEditorFontFamily(settings ?? null)

  const monacoLanguage = detectLanguage(draft.fileName || 'snippet.txt')

  const handleMonacoChange = useCallback(
    (value: string | undefined) => {
      onDraftChange({ content: value ?? '' })
    },
    [onDraftChange]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 py-4">
      <div className="grid shrink-0 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="gitlab-snippet-title">
            {translate('auto.components.right.sidebar.GitLabSnippetDialog.title', 'Title')}
          </Label>
          <Input
            id="gitlab-snippet-title"
            value={draft.title}
            disabled={disabled}
            onChange={(event) => onDraftChange({ title: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gitlab-snippet-file">
            {translate('auto.components.right.sidebar.GitLabSnippetDialog.fileName', 'File name')}
          </Label>
          <Input
            id="gitlab-snippet-file"
            value={draft.fileName}
            disabled={disabled}
            onChange={(event) => onDraftChange({ fileName: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            {translate(
              'auto.components.right.sidebar.GitLabSnippetDialog.visibility',
              'Visibility'
            )}
          </Label>
          <Select
            value={draft.visibility}
            disabled={disabled}
            onValueChange={(value) =>
              onDraftChange({ visibility: value as GitLabSnippetVisibility })
            }
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">private</SelectItem>
              <SelectItem value="internal">internal</SelectItem>
              <SelectItem value="public">public</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {mode === 'create' ? (
        <div className="space-y-1.5">
          <Label htmlFor="gitlab-snippet-description">
            {translate(
              'auto.components.right.sidebar.GitLabSnippetDialog.description',
              'Description'
            )}
          </Label>
          <Input
            id="gitlab-snippet-description"
            value={draft.description}
            disabled={disabled}
            placeholder={translate(
              'auto.components.right.sidebar.GitLabSnippetDialog.descriptionPlaceholder',
              'Optional description'
            )}
            onChange={(event) => onDraftChange({ description: event.target.value })}
          />
        </div>
      ) : descriptionText ? (
        <div className="shrink-0 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {translate(
              'auto.components.right.sidebar.GitLabSnippetDialog.description',
              'Description'
            )}
          </p>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
            {descriptionText}
          </p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        {/* Editor header bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
          <p className="text-[11px] text-muted-foreground">
            {draft.fileName || 'snippet'}
            {dirty ? ' · unsaved' : ''}
            {` · ${draft.content.length} chars`}
            {!isMd && (
              <span className="ml-1.5 rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px]">
                {monacoLanguage}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            {/* .md toggle: Source ↔ Rich MD */}
            {isMd && (
              <div className="flex items-center rounded-md border border-border/60 bg-muted/30 p-0.5">
                <button
                  type="button"
                  title="Source editor (Monaco)"
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors ${
                    mdViewMode === 'source'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setMdViewMode('source')}
                >
                  <Code className="h-3 w-3" />
                  Source
                </button>
                <button
                  type="button"
                  title="Rich Markdown editor"
                  className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors ${
                    mdViewMode === 'rich'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setMdViewMode('rich')}
                >
                  <FileText className="h-3 w-3" />
                  Rich MD
                </button>
              </div>
            )}
            {webUrl ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => void window.api.shell.openUrl(webUrl)}
              >
                <ExternalLink className="h-3 w-3" />
                {translate(
                  'auto.components.right.sidebar.GitLabSnippetDialog.openOnGitLab',
                  'Open on GitLab'
                )}
              </button>
            ) : null}
          </div>
        </div>

        {/* Editor body */}
        <div className="relative min-h-[360px] flex-1 bg-background">
          {loading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-xs text-muted-foreground">
              <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />
              {translate(
                'auto.components.right.sidebar.GitLabSnippetDialog.loading',
                'Loading snippet…'
              )}
            </div>
          ) : null}
          {loadError ? (
            <div className="absolute inset-x-0 top-0 z-10 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
              {loadError}
            </div>
          ) : null}

          {/* Rich MD mode (only for .md files) */}
          {isMd && mdViewMode === 'rich' ? (
            <SnippetRichMarkdownEditor
              value={draft.content}
              onChange={(v) => onDraftChange({ content: v })}
              disabled={disabled}
            />
          ) : (
            /* Monaco editor — default for all files, and source mode for .md */
            <Suspense
              fallback={
                <div className="flex h-full min-h-[360px] items-center justify-center text-xs text-muted-foreground">
                  <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Loading editor…
                </div>
              }
            >
              <MonacoEditorLazy
                height="100%"
                defaultLanguage={monacoLanguage}
                language={monacoLanguage}
                value={draft.content}
                theme={isDark ? 'vs-dark' : 'light'}
                options={{
                  fontSize: editorFontSize,
                  fontFamily: editorFontFamily,
                  readOnly: disabled,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: isMd ? 'on' : 'off',
                  lineNumbers: isMd ? 'off' : 'on',
                  folding: false,
                  renderLineHighlight: 'none',
                  overviewRulerLanes: 0,
                  padding: { top: 8, bottom: 8 },
                  scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 }
                }}
                onChange={handleMonacoChange}
              />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  )
}
