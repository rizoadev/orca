import {
  CloudUpload,
  CloudDownload,
  CheckCircle2,
  Circle,
  Eye,
  ExternalLink,
  LoaderCircle,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { GitLabSnippet } from '../../../../shared/types'

export type SyncStatus = 'idle' | 'uploading' | 'downloading' | 'deleting'

export type SyncRow = {
  relativePath: string
  localFile: boolean
  snippet?: GitLabSnippet
}

export function EnvSnippetSyncList({
  rows,
  syncStatusByPath,
  onUpload,
  onRestore,
  onPreview,
  onDelete,
  onOpen
}: {
  rows: SyncRow[]
  syncStatusByPath: Record<string, SyncStatus>
  onUpload: (relativePath: string) => void
  onRestore: (snippet: GitLabSnippet) => void
  onPreview: (snippet: GitLabSnippet) => void
  onDelete: (snippet: GitLabSnippet) => void
  onOpen: (url: string) => void
}): React.JSX.Element {
  return (
    <ul className="space-y-0.5">
      {rows.map(({ relativePath, localFile, snippet }) => {
        const synced = snippet !== undefined
        const rowKey = snippet ? `snippet-${snippet.id}` : `local-${relativePath}`
        const status = syncStatusByPath[relativePath] ?? 'idle'
        const busy = status === 'uploading' || status === 'downloading' || status === 'deleting'
        const snippetWebUrl = snippet?.webUrl ?? ''
        return (
          <li
            key={rowKey}
            className="flex items-center gap-1.5 rounded px-2 py-1.5 transition-colors hover:bg-sidebar-accent"
          >
            {synced ? (
              <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
            ) : (
              <Circle className="h-3 w-3 shrink-0 text-muted-foreground/40" />
            )}
            <span className="min-w-0 flex-1 truncate text-[11px] text-foreground">
              {relativePath}
            </span>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={busy || !localFile}
                onClick={() => onUpload(relativePath)}
                title={translate(
                  'auto.components.right.sidebar.EnvSnippetSyncSection.push',
                  'Sync to GitLab'
                )}
              >
                {status === 'uploading' ? (
                  <LoaderCircle className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : (
                  <CloudUpload
                    className={cn(
                      'h-3 w-3',
                      localFile ? 'text-muted-foreground' : 'text-muted-foreground/30'
                    )}
                  />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={busy || !synced}
                onClick={() => snippet && onRestore(snippet)}
                title={translate(
                  'auto.components.right.sidebar.EnvSnippetSyncSection.pull',
                  'Restore from GitLab'
                )}
              >
                {status === 'downloading' ? (
                  <LoaderCircle className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : (
                  <CloudDownload
                    className={cn(
                      'h-3 w-3',
                      synced ? 'text-muted-foreground' : 'text-muted-foreground/30'
                    )}
                  />
                )}
              </Button>
              {snippet ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={busy}
                  onClick={() => onPreview(snippet)}
                  title={translate(
                    'auto.components.right.sidebar.EnvSnippetSyncSection.preview',
                    'Preview diff vs local'
                  )}
                >
                  <Eye className="h-3 w-3 text-muted-foreground" />
                </Button>
              ) : null}
              {snippetWebUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={busy}
                  onClick={() => onOpen(snippetWebUrl)}
                  title={translate(
                    'auto.components.right.sidebar.EnvSnippetSyncSection.openSnippet',
                    'Open snippet'
                  )}
                >
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </Button>
              ) : null}
              {snippet ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => onDelete(snippet)}
                  title={translate(
                    'auto.components.right.sidebar.EnvSnippetSyncSection.delete',
                    'Delete snippet from GitLab'
                  )}
                >
                  {status === 'deleting' ? (
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
