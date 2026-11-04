/**
 * Snippet preview modal — side-by-side diff of local file vs GitLab snippet.
 * Uses the existing DiffViewer component (Monaco-based) for proper diff coloring.
 */
import React, { Suspense, useEffect, useState } from 'react'
import { LoaderCircle, ExternalLink } from 'lucide-react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { detectLanguage } from '@/lib/language-detect'
import { openHttpLink } from '@/lib/http-link-routing'
import { joinPath } from '@/lib/path'
import { userNamedFileAccess } from '@/lib/local-file-access'
import { translate } from '@/i18n/i18n'
import type { GitLabSnippet, GitLabSnippetDetail } from '../../shared/types'
import { relativePathFromSnippetTitle } from './snippet-encoding'
const DiffViewer = lazy(() => import('@/components/editor/DiffViewer'))

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; local: string; remote: string }

type SnippetPreviewModalProps = {
  snippet: GitLabSnippet | null
  worktreePath: string
  connectionId: string | null
  onClose: () => void
}

export function SnippetPreviewModal({
  snippet,
  worktreePath,
  connectionId,
  onClose
}: SnippetPreviewModalProps): React.JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: 'idle' })

  const relativePath = snippet
    ? (relativePathFromSnippetTitle(snippet.title) ?? snippet.fileName)
    : ''
  const language = relativePath ? detectLanguage(relativePath) : 'plaintext'
  const open = snippet !== null

  // Reset + fetch both sides whenever snippet changes
  useEffect(() => {
    if (!snippet || !relativePath) {
      setState({ kind: 'idle' })
      return
    }

    setState({ kind: 'loading' })
    let cancelled = false

    const filePath = joinPath(worktreePath, relativePath)

    const localPromise = window.api.fs.readFile({
      filePath,
      connectionId: connectionId ?? undefined,
      access: userNamedFileAccess()
    })

    const remotePromise = window.api.gl.getProjectSnippet({
      repoPath: worktreePath,
      snippetId: snippet.id
    })

    Promise.all([localPromise, remotePromise])
      .then(
        ([localResult, remoteResult]: [
          Awaited<ReturnType<typeof window.api.fs.readFile>>,
          { ok: boolean; snippet?: GitLabSnippetDetail; error?: string }
        ]) => {
          if (cancelled) {
            return
          }
          if (localResult.isBinary) {
            setState({ kind: 'error', message: 'Local file is binary — cannot diff' })
            return
          }
          if (!remoteResult.ok || !remoteResult.snippet) {
            setState({
              kind: 'error',
              message: `GitLab: ${remoteResult.error ?? 'Failed to fetch snippet'}`
            })
            return
          }
          setState({
            kind: 'ready',
            local: localResult.content,
            remote: remoteResult.snippet.content
          })
        }
      )
      .catch((err: unknown) => {
        if (cancelled) {
          return
        }
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      })

    return () => {
      cancelled = true
    }
  }, [snippet, snippet?.id, relativePath, worktreePath, connectionId])

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setState({ kind: 'idle' })
    }
  }, [open])

  const modelKey = `snippet-preview:${snippet?.id ?? 'none'}`

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-5xl p-0 flex flex-col h-full">
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <SheetTitle className="text-sm font-semibold truncate">
                {relativePath || snippet?.title}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                {translate('custom.snippetDiff', 'Local (left) vs GitLab Snippet (right)')}
                {snippet?.updatedAt && ` · updated ${snippet.updatedAt}`}
              </SheetDescription>
            </div>
            {snippet?.webUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => openHttpLink(snippet.webUrl)}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Open in GitLab
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* Content */}
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {state.kind === 'idle' || state.kind === 'loading' ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />
              {state.kind === 'loading' ? 'Loading diff…' : 'Opening…'}
            </div>
          ) : state.kind === 'error' ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-xs text-destructive">
              {state.message}
            </div>
          ) : (
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
                  originalContent={state.local}
                  modifiedContent={state.remote}
                  language={language}
                  filePath={relativePath}
                  relativePath={relativePath}
                  sideBySide
                />
              </div>
            </Suspense>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
