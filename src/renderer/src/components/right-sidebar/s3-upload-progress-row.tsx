/**
 * Inline row showing one S3 upload's live progress, then a fade-out + store
 * removal once it completes. Rendered inside the S3 Uploads sidebar block.
 */
import { useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { translate } from '@/i18n/i18n'
import { formatBytes } from '@/components/status-bar/workspace-space-format'
import { cn } from '@/lib/utils'
import { removeS3Upload, type S3UploadEntry } from './s3-upload-manager'

export function S3UploadProgressRow({ entry }: { entry: S3UploadEntry }): React.JSX.Element {
  const [fading, setFading] = useState(false)
  const percent =
    entry.totalBytes > 0
      ? Math.min(100, Math.round((entry.bytesUploaded / entry.totalBytes) * 100))
      : entry.status === 'done'
        ? 100
        : 0

  // Why: a finished row lingers long enough to read, then fades itself out
  // and leaves the store so the block returns to a clean object list. The two
  // timers live in separate effects — putting both in one effect would let the
  // fade-triggered re-render cancel the removal before it fires.
  useEffect(() => {
    if (entry.status !== 'done') {
      return
    }
    const fadeTimer = setTimeout(() => setFading(true), 3_000)
    return () => clearTimeout(fadeTimer)
  }, [entry.status, entry.uploadId])

  useEffect(() => {
    if (entry.status !== 'done') {
      return
    }
    const removeTimer = setTimeout(() => removeS3Upload(entry.uploadId), 3_400)
    return () => clearTimeout(removeTimer)
  }, [entry.status, entry.uploadId])

  return (
    <li
      className={cn(
        'rounded-md border border-border/60 p-2 transition-opacity duration-300',
        fading && 'opacity-0'
      )}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
          {entry.objectKey}
        </span>
        {entry.status === 'uploading' ? (
          <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : entry.status === 'done' ? (
          <CheckCircle2 className="size-3.5 shrink-0 text-status-success" />
        ) : (
          <XCircle className="size-3.5 shrink-0 text-destructive" />
        )}
      </div>
      {entry.status === 'uploading' ? (
        <div className="mt-1.5 flex items-center gap-2">
          <Progress value={percent} className="h-1.5 flex-1" />
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {percent}% · {formatBytes(entry.bytesUploaded)}/{formatBytes(entry.totalBytes)}
          </span>
        </div>
      ) : entry.status === 'error' && entry.error ? (
        <p className="mt-1 text-[10px] text-destructive">{entry.error}</p>
      ) : null}
    </li>
  )
}

export const S3UploadProgressRowEmptyState = translate(
  'auto.components.right.sidebar.S3ObjectBrowserSection.loading',
  'Loading…'
)
