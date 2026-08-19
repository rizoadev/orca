import { LoaderCircle, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { EnvSnippetPreviewDialog } from './env-snippet-preview-dialog'
import type { Repo } from '../../../../shared/types'

export function isRepoNotAttachedError(message: string | null): boolean {
  if (!message) {
    return false
  }
  const lower = message.toLowerCase()
  return lower.includes('access denied') || lower.includes('unknown repository path')
}

export type SnippetPreview = {
  filePath: string
  relativePath: string
  snippetContent: string
}

export function EnvSnippetSyncExtras({
  showAttach,
  attaching,
  onAttach,
  preview,
  onClosePreview,
  connectionId,
  repo,
  worktreePath,
  branch,
  onSynced
}: {
  showAttach: boolean
  attaching: boolean
  onAttach: () => void
  preview: SnippetPreview | null
  onClosePreview: () => void
  connectionId: string | null
  repo: Repo
  worktreePath: string
  branch: string
  onSynced: () => void
}): React.JSX.Element {
  return (
    <>
      {showAttach ? (
        <div className="flex flex-col items-center gap-1.5 px-3 py-3">
          <p className="text-center text-[11px] text-muted-foreground">
            {translate(
              'auto.components.right.sidebar.EnvSnippetSyncSection.attachHint',
              'Attach this project as a GitLab repo to sync snippets.'
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={attaching}
            onClick={onAttach}
          >
            {attaching ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <KeyRound className="h-3.5 w-3.5" />
            )}
            {translate(
              'auto.components.right.sidebar.EnvSnippetSyncSection.attach',
              'Attach GitLab repo'
            )}
          </Button>
        </div>
      ) : null}
      {preview ? (
        <EnvSnippetPreviewDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              onClosePreview()
            }
          }}
          filePath={preview.filePath}
          relativePath={preview.relativePath}
          snippetContent={preview.snippetContent}
          connectionId={connectionId}
          repo={repo}
          worktreePath={worktreePath}
          branch={branch}
          onSynced={onSynced}
        />
      ) : null}
    </>
  )
}
