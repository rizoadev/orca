import React, { useCallback, useEffect } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { LoaderCircle, RefreshCw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { computeEditorFontSize, resolveEditorFontFamily } from '@/lib/editor-font-zoom'
import { resolveDocumentTheme } from '@/lib/document-theme'
import { monaco } from '@/lib/monaco-setup'
import { useAppStore } from '@/store'
import type { HiveEnvFile } from '../../../../shared/hive-types'

function languageForEnvPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.json')) {
    return 'json'
  }
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) {
    return 'yaml'
  }
  if (lower.endsWith('.toml')) {
    return 'ini'
  }
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) {
    return 'shell'
  }
  // Why: dotenv-style files get shell highlighting so KEY=value still has contrast.
  if (lower.includes('.env') || lower.endsWith('env') || lower.endsWith('.properties')) {
    return 'shell'
  }
  return 'plaintext'
}

type HiveEnvFilesEditorProps = {
  files: HiveEnvFile[]
  fileDrafts: Record<string, string>
  activeFilePath: string
  loadingFiles: boolean
  savingFiles: boolean
  dirty: boolean
  onActivePathChange: (path: string) => void
  onDraftChange: (path: string, content: string) => void
  onReload: () => void
  onSave: () => void
}

export function HiveEnvFilesEditor({
  files,
  fileDrafts,
  activeFilePath,
  loadingFiles,
  savingFiles,
  dirty,
  onActivePathChange,
  onDraftChange,
  onReload,
  onSave
}: HiveEnvFilesEditorProps): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const editorFontZoomLevel = useAppStore((s) => s.editorFontZoomLevel)
  const isDark = resolveDocumentTheme(settings?.theme ?? 'system')
  const editorFontSize = computeEditorFontSize(
    settings?.terminalFontSize ?? 13,
    editorFontZoomLevel
  )
  const editorFontFamily = resolveEditorFontFamily(settings)
  const activeContent = activeFilePath ? (fileDrafts[activeFilePath] ?? '') : ''
  const activeLanguage = activeFilePath ? languageForEnvPath(activeFilePath) : 'plaintext'

  useEffect(() => {
    monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs')
  }, [isDark])

  const handleEditorMount: OnMount = useCallback((editorInstance) => {
    editorInstance.layout()
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-[11px] text-muted-foreground">
          {loadingFiles ? 'Loading…' : `${files.length} file(s)`}
          {dirty ? ' · unsaved changes' : null}
        </div>
        <div className="ml-auto flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            disabled={loadingFiles}
            onClick={onReload}
          >
            <RefreshCw className={cn('size-3', loadingFiles && 'animate-spin')} />
            Reload
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!dirty || savingFiles || loadingFiles}
            onClick={onSave}
          >
            {savingFiles ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : (
              <Save className="size-3" />
            )}
            Save
          </Button>
        </div>
      </div>

      {loadingFiles && files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          <LoaderCircle className="mr-2 size-3.5 animate-spin" />
          Loading env files…
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          No env files for this environment.
        </div>
      ) : (
        <div className="grid min-h-[560px] flex-1 grid-cols-[200px_minmax(0,1fr)] gap-2 overflow-hidden">
          <div className="min-h-0 space-y-1 overflow-y-auto rounded-md border border-border/50 p-1 scrollbar-sleek">
            {files.map((file) => {
              const isDirty = (fileDrafts[file.path] ?? '') !== file.content
              return (
                <button
                  key={file.path}
                  type="button"
                  className={cn(
                    'flex w-full items-center rounded px-2 py-1.5 text-left text-[11px] hover:bg-muted/60',
                    activeFilePath === file.path && 'bg-muted font-medium'
                  )}
                  onClick={() => onActivePathChange(file.path)}
                >
                  <span className="truncate">{file.path}</span>
                  {isDirty ? (
                    <span className="ml-auto size-1.5 shrink-0 rounded-full bg-amber-500" />
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className="h-full min-h-[560px] overflow-hidden rounded-md border border-border/60 bg-editor-surface">
            <Editor
              height="100%"
              path={activeFilePath || 'env-file'}
              language={activeLanguage}
              theme={isDark ? 'vs-dark' : 'vs'}
              value={activeContent}
              onMount={handleEditorMount}
              onChange={(value) => {
                if (!activeFilePath) {
                  return
                }
                onDraftChange(activeFilePath, value ?? '')
              }}
              options={{
                automaticLayout: true,
                fontFamily: editorFontFamily,
                fontSize: editorFontSize,
                fontLigatures: true,
                minimap: { enabled: false },
                lineNumbers: 'on',
                lineNumbersMinChars: 3,
                glyphMargin: false,
                folding: true,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                renderLineHighlight: 'line',
                tabSize: 2,
                padding: { top: 10, bottom: 10 },
                scrollbar: {
                  verticalScrollbarSize: 10,
                  horizontalScrollbarSize: 10
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
