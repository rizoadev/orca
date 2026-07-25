import React from 'react'
import { LoaderCircle, RefreshCw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { HiveEnvFile } from '../../../../shared/hive-types'

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
  const activeContent = activeFilePath ? (fileDrafts[activeFilePath] ?? '') : ''

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-[11px] text-muted-foreground">
          {loadingFiles ? 'Loading…' : `${files.length} file(s)`}
          {dirty ? ' · unsaved changes' : null}
          {activeFilePath ? ` · ${activeFilePath} · ${activeContent.length} chars` : null}
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
              const draft = fileDrafts[file.path] ?? ''
              const isDirty = draft !== file.content
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
          <div className="relative flex h-[560px] min-h-[560px] w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background">
            {!activeFilePath ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Select a file
              </div>
            ) : (
              <textarea
                key={activeFilePath}
                value={activeContent}
                spellCheck={false}
                className="h-full w-full resize-none bg-transparent p-3 font-mono text-[12px] leading-5 text-foreground outline-none placeholder:text-muted-foreground scrollbar-sleek"
                placeholder={
                  loadingFiles ? 'Loading…' : 'Empty file — paste env contents here, then Save.'
                }
                onChange={(event) => onDraftChange(activeFilePath, event.target.value)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
