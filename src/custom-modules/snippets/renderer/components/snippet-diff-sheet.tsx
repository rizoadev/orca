/**
 * Snippet diff sheet — shared side-by-side diff shell for snippet previews.
 * Callers own fetching both sides; this renders the Sheet + DiffViewer.
 */
import React, { Suspense } from 'react'
import { LoaderCircle } from 'lucide-react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet'
import type { ReactNode } from 'react'

const DiffViewer = lazy(() => import('@/components/editor/diff/monaco-view/DiffViewer'))

/** Local side of a diff may legitimately not exist yet (snippet synced from elsewhere). */
export function isLocalFileMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /ENOENT|no such file or directory/i.test(message)
}

export type SnippetDiffSheetProps = {
  open: boolean
  title: string
  description: string
  language: string
  relativePath: string
  /** Stable Monaco model identity; changes remount the editor. */
  modelKey: string
  local: string
  remote: string
  headerActions?: ReactNode
  onClose: () => void
}

export function SnippetDiffSheet({
  open,
  title,
  description,
  language,
  relativePath,
  modelKey,
  local,
  remote,
  headerActions,
  onClose
}: SnippetDiffSheetProps): React.JSX.Element {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-5xl p-0 flex flex-col h-full">
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <SheetTitle className="text-sm font-semibold truncate">{title}</SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                {description}
              </SheetDescription>
            </div>
            {headerActions}
          </div>
        </SheetHeader>

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />
                Loading editor…
              </div>
            }
          >
            <div className="flex flex-col flex-1 min-h-0 h-full">
              <DiffViewer
                modelKey={modelKey}
                originalContent={local}
                modifiedContent={remote}
                language={language}
                filePath={relativePath}
                relativePath={relativePath}
                sideBySide
              />
            </div>
          </Suspense>
        </div>
      </SheetContent>
    </Sheet>
  )
}
