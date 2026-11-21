/**
 * Snippet preview modal — side-by-side diff of local file vs GitLab snippet.
 * Uses the existing DiffViewer component (Monaco-based) for proper diff coloring.
 */
import React, { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { detectLanguage } from '@/lib/language-detect'
import { openHttpLink } from '@/lib/http-link-routing'
import { joinPath } from '@/lib/path'
import { userNamedFileAccess } from '@/lib/local-file-access'
import { translate } from '@/i18n/i18n'
import type { GitLabSnippet, GitLabSnippetDetail } from '../../shared/types'
import { relativePathFromSnippetTitle } from './snippet-encoding'
import { SnippetDiffSheet, isLocalFileMissing } from './snippet-diff-sheet'

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

    const localPromise = window.api.fs
      .readFile({
        filePath,
        connectionId: connectionId ?? undefined,
        access: userNamedFileAccess()
      })
      .catch((err: unknown) => {
        if (isLocalFileMissing(err)) {
          // Snippet has no counterpart on disk yet — diff against an empty local side.
          return { isBinary: false, content: '' }
        }
        throw err
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
      description={translate('custom.snippetDiff', 'Local (left) vs GitLab Snippet (right)')}
      language={language}
      relativePath={relativePath}
      modelKey={modelKey}
      local={state.local}
      remote={state.remote}
      onClose={onClose}
      headerActions={
        snippet.webUrl ? (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => openHttpLink(snippet.webUrl)}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            Open in GitLab
          </Button>
        ) : undefined
      }
    />
  )
}
