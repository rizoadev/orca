import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { translate } from '@/i18n/i18n'
import type { GitLabSnippet, GitLabSnippetDetail, Repo } from '../../../../shared/types'
import { getRepoIssueSourceContext } from './issues-panel-rows'
import { GitLabSnippetDialogForm, type SnippetDraft } from './gitlab-snippet-dialog-form'

const EMPTY_DRAFT: SnippetDraft = {
  title: '',
  fileName: 'snippet.md',
  description: '',
  visibility: 'private',
  content: ''
}

function toDraft(snippet: GitLabSnippetDetail | null): SnippetDraft {
  if (!snippet) {
    return { ...EMPTY_DRAFT }
  }
  return {
    title: snippet.title,
    fileName: snippet.fileName || 'snippet.md',
    description: snippet.description,
    visibility: snippet.visibility,
    content: snippet.content
  }
}

function draftEquals(a: SnippetDraft, b: SnippetDraft): boolean {
  return (
    a.title === b.title &&
    a.fileName === b.fileName &&
    a.description === b.description &&
    a.visibility === b.visibility &&
    a.content === b.content
  )
}

export function GitLabSnippetDialog({
  open,
  mode,
  repo,
  snippet,
  onOpenChange,
  onSaved,
  onDeleted
}: {
  open: boolean
  mode: 'create' | 'edit'
  repo: Repo
  snippet: GitLabSnippet | null
  onOpenChange: (open: boolean) => void
  onSaved: (snippet: GitLabSnippet) => void
  onDeleted: (snippetId: number) => void
}): React.JSX.Element {
  const confirm = useConfirmationDialog()
  const [draft, setDraft] = useState<SnippetDraft>(EMPTY_DRAFT)
  const [baseline, setBaseline] = useState<SnippetDraft>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [webUrl, setWebUrl] = useState('')

  const dirty = !draftEquals(draft, baseline)
  const canSave =
    draft.title.trim().length > 0 &&
    draft.fileName.trim().length > 0 &&
    draft.content.length > 0 &&
    !saving &&
    !loading &&
    (mode === 'create' || dirty)

  const sourceArgs = useMemo(
    () => ({
      repoPath: repo.path,
      repoId: repo.id,
      sourceContext: getRepoIssueSourceContext(repo, 'gitlab')
    }),
    [repo]
  )

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false
    setLoadError(null)

    if (mode === 'create') {
      const next = { ...EMPTY_DRAFT }
      setDraft(next)
      setBaseline(next)
      setWebUrl('')
      setLoading(false)
      return
    }

    if (!snippet) {
      return
    }

    setLoading(true)
    setWebUrl(snippet.webUrl)
    void (async () => {
      try {
        const result = await window.api.gl.getProjectSnippet({
          ...sourceArgs,
          snippetId: snippet.id
        })
        if (cancelled) {
          return
        }
        if (!result.ok) {
          setLoadError(result.error)
          const fallback = toDraft({ ...snippet, content: '' })
          setDraft(fallback)
          setBaseline(fallback)
          return
        }
        const next = toDraft(result.snippet)
        setDraft(next)
        setBaseline(next)
        setWebUrl(result.snippet.webUrl || snippet.webUrl)
      } catch (error) {
        if (cancelled) {
          return
        }
        setLoadError(error instanceof Error ? error.message : String(error))
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mode, open, snippet, sourceArgs])

  const handleSave = useCallback(async () => {
    if (!canSave) {
      return
    }
    setSaving(true)
    try {
      if (mode === 'create') {
        const result = await window.api.gl.createProjectSnippet({
          ...sourceArgs,
          title: draft.title.trim(),
          fileName: draft.fileName.trim(),
          content: draft.content,
          description: draft.description.trim(),
          visibility: draft.visibility
        })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success(
          translate('auto.components.right.sidebar.GitLabSnippetDialog.created', 'Snippet created')
        )
        onSaved(result.snippet)
        onOpenChange(false)
        return
      }

      if (!snippet) {
        return
      }
      const result = await window.api.gl.updateProjectSnippet({
        ...sourceArgs,
        snippetId: snippet.id,
        updates: {
          title: draft.title.trim(),
          fileName: draft.fileName.trim(),
          content: draft.content,
          description: draft.description.trim(),
          visibility: draft.visibility
        }
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const next = toDraft(result.snippet)
      setDraft(next)
      setBaseline(next)
      setWebUrl(result.snippet.webUrl || webUrl)
      toast.success(
        translate('auto.components.right.sidebar.GitLabSnippetDialog.saved', 'Snippet saved')
      )
      onSaved(result.snippet)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }, [canSave, draft, mode, onOpenChange, onSaved, snippet, sourceArgs, webUrl])

  const handleDelete = useCallback(async () => {
    if (!snippet || mode !== 'edit') {
      return
    }
    const confirmed = await confirm({
      title: translate(
        'auto.components.right.sidebar.GitLabSnippetDialog.deleteTitle',
        'Delete snippet?'
      ),
      description: translate(
        'auto.components.right.sidebar.GitLabSnippetDialog.deleteBody',
        '“{{value0}}” will be permanently removed from this GitLab project.',
        { value0: draft.title || snippet.title }
      ),
      confirmLabel: translate(
        'auto.components.right.sidebar.GitLabSnippetDialog.deleteConfirm',
        'Delete'
      ),
      cancelLabel: translate('auto.components.right.sidebar.GitLabSnippetDialog.cancel', 'Cancel'),
      confirmVariant: 'destructive'
    })
    if (!confirmed) {
      return
    }

    setDeleting(true)
    try {
      const result = await window.api.gl.deleteProjectSnippet({
        ...sourceArgs,
        snippetId: snippet.id
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        translate('auto.components.right.sidebar.GitLabSnippetDialog.deleted', 'Snippet deleted')
      )
      onDeleted(snippet.id)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setDeleting(false)
    }
  }, [confirm, draft.title, mode, onDeleted, onOpenChange, snippet, sourceArgs])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(820px,92vh)] max-h-[min(820px,92vh)] w-[min(960px,96vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px]">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle>
            {mode === 'create'
              ? translate(
                  'auto.components.right.sidebar.GitLabSnippetDialog.createTitle',
                  'New snippet'
                )
              : translate('auto.components.right.sidebar.GitLabSnippetDialog.editTitle', 'Snippet')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? translate(
                  'auto.components.right.sidebar.GitLabSnippetDialog.createBody',
                  'Create a project snippet in {{value0}}.',
                  { value0: repo.displayName || repo.path }
                )
              : translate(
                  'auto.components.right.sidebar.GitLabSnippetDialog.editBody',
                  'View and edit this project snippet.'
                )}
          </DialogDescription>
        </DialogHeader>

        <GitLabSnippetDialogForm
          draft={draft}
          dirty={dirty}
          webUrl={webUrl}
          loading={loading}
          saving={saving}
          deleting={deleting}
          loadError={loadError}
          mode={mode}
          onDraftChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
        />

        <DialogFooter className="border-t border-border/60 bg-muted/10 px-5 py-3 sm:justify-between">
          <div>
            {mode === 'edit' ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={loading || saving || deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                {translate('auto.components.right.sidebar.GitLabSnippetDialog.delete', 'Delete')}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving || deleting}
              onClick={() => onOpenChange(false)}
            >
              {translate('auto.components.right.sidebar.GitLabSnippetDialog.cancel', 'Cancel')}
            </Button>
            <Button type="button" disabled={!canSave} onClick={() => void handleSave()}>
              {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              {mode === 'create'
                ? translate('auto.components.right.sidebar.GitLabSnippetDialog.create', 'Create')
                : translate('auto.components.right.sidebar.GitLabSnippetDialog.save', 'Save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
