/**
 * Turso snippet preview modal — side-by-side diff of local file vs Turso snippet.
 */
import React, { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { detectLanguage } from '@/lib/language-detect'
import { joinPath } from '@/lib/path'
import { userNamedFileAccess } from '@/lib/local-file-access'
import { translate } from '@/i18n/i18n'
import type { TursoSnippet } from '../../../../shared/turso/turso-snippet-types'
import { SnippetDiffSheet, isLocalFileMissing } from './snippet-diff-sheet'
import { relativePathFromSnippetTitle } from './snippet-encoding'

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; local: string }

type TursoSnippetPreviewModalProps = {
  snippet: TursoSnippet | null
  worktreePath: string
  connectionId: string | null
  onClose: () => void
}

export function TursoSnippetPreviewModal({
  snippet,
  worktreePath,
  connectionId,
  onClose
}: TursoSnippetPreviewModalProps): React.JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: 'idle' })

  // fileName encodes '/' as '__'; the title carries the real relative path.
  const relativePath = snippet
    ? (relativePathFromSnippetTitle(snippet.title) ?? snippet.fileName.replace(/__/g, '/'))
    : ''
  const language = relativePath ? detectLanguage(relativePath) : 'plaintext'
  const open = snippet !== null

  useEffect(() => {
    if (!snippet || !relativePath) {
      setState({ kind: 'idle' })
      return
    }

    setState({ kind: 'loading' })
    let cancelled = false

    window.api.fs
      .readFile({
        filePath: joinPath(worktreePath, relativePath),
        connectionId: connectionId ?? undefined,
        access: userNamedFileAccess()
      })
      .then((localResult) => {
        if (cancelled) {
          return
        }
        if (localResult.isBinary) {
          setState({ kind: 'error', message: 'Local file is binary — cannot diff' })
          return
        }
        setState({ kind: 'ready', local: localResult.content })
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return
        }
        if (isLocalFileMissing(err)) {
          // Snippet has no counterpart on disk yet — diff against an empty local side.
          setState({ kind: 'ready', local: '' })
          return
        }
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      })

    return () => {
      cancelled = true
    }
  }, [snippet, relativePath, worktreePath, connectionId])

  useEffect(() => {
    if (!open) {
      setState({ kind: 'idle' })
    }
  }, [open])

  if (!snippet || state.kind !== 'ready') {
    return (
      <Sheet
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            onClose()
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-5xl p-0 flex flex-col h-full">
          <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
            <SheetTitle className="text-sm font-semibold truncate">
              {relativePath || snippet?.title}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            {state.kind === 'error' ? (
              <span className="p-6 text-center text-destructive">{state.message}</span>
            ) : (
              <>
                <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {state.kind === 'loading' ? 'Loading diff…' : 'Opening…'}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <SnippetDiffSheet
      open={open}
      title={relativePath || snippet.title}
      description={translate('custom.tursoSnippetDiff', 'Local (left) vs Turso Snippet (right)')}
      language={language}
      relativePath={relativePath}
      modelKey={`turso-snippet-preview:${snippet.id}`}
      local={state.local}
      remote={snippet.content}
      onClose={onClose}
    />
  )
}
