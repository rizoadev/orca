/**
 * Right-sidebar block listing the S3 objects uploaded for a chosen
 * project+branch ({provider}/{owner}/{repo}/{branch}/ prefix). Filters let the
 * user browse any repo's uploads across branches. Shows live upload progress
 * inline (no modal) and supports refresh, download back into the worktree, and
 * delete.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CloudDownload,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  Trash2
} from 'lucide-react'
import { toast } from 'sonner'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { branchName } from '@/lib/git-utils'
import { joinPath } from '@/lib/path'
import { formatBytes } from '@/components/status-bar/workspace-space-format'
import type { S3ObjectSummary } from '../../../../shared/s3-types'
import type { Repo } from '../../../../shared/types'
import {
  relativePathFromS3Key,
  repoIdentityFromRepo,
  s3ProjectPrefix,
  s3RepoPrefix
} from './s3-object-key'
import { getS3Uploads, subscribeS3Uploads, type S3UploadEntry } from './s3-upload-manager'
import { S3UploadProgressRow } from './s3-upload-progress-row'
import { S3FilterBar, type S3BrowseScope } from './s3-filter-bar'

export function S3ObjectBrowserSection({
  worktreePath,
  repo,
  branch
}: {
  worktreePath: string | null
  repo: Repo | null
  branch: string
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<S3ObjectSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [uploads, setUploads] = useState<S3UploadEntry[]>(() => getS3Uploads())
  // Why: scope = 'branch' shows only the active worktree branch; 'repo'
  // widens to every branch's uploads for the same repo.
  const [scope, setScope] = useState<S3BrowseScope>('branch')
  const mountedRef = useRef(true)

  const identity = useMemo(() => (repo ? repoIdentityFromRepo(repo) : null), [repo])
  const branchNameSafe = useMemo(() => branchName(branch) || 'unknown', [branch])

  const prefix = useMemo(() => {
    if (!identity) {
      return null
    }
    return scope === 'repo'
      ? s3RepoPrefix(identity)
      : s3ProjectPrefix({ ...identity, branch: branchNameSafe })
  }, [branchNameSafe, identity, scope])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    return subscribeS3Uploads(() => setUploads(getS3Uploads()))
  }, [])

  // Why: transfers start from a right-click elsewhere; auto-expand the block
  // so the progress is visible without hunting for it.
  useEffect(() => {
    if (uploads.some((entry) => entry.status === 'uploading')) {
      setOpen(true)
    }
  }, [uploads])

  const load = useCallback(async () => {
    if (!prefix || !window.api.s3?.listObjects) {
      setItems([])
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const result = await window.api.s3.listObjects({ prefix })
      if (!mountedRef.current) {
        return
      }
      if (result.ok) {
        setItems(result.items)
      } else {
        setLoadError(result.error)
        setItems([])
      }
    } catch (err) {
      if (!mountedRef.current) {
        return
      }
      setLoadError(err instanceof Error ? err.message : String(err))
      setItems([])
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [prefix])

  useEffect(() => {
    if (open && prefix) {
      void load()
    }
  }, [open, prefix, load])

  // Why: keep the object list in sync once a transfer finishes so freshly
  // uploaded files appear without a manual reload.
  const previouslyActive = useRef(0)
  useEffect(() => {
    const activeNow = uploads.filter((entry) => entry.status === 'uploading').length
    if (previouslyActive.current > 0 && activeNow === 0 && prefix) {
      void load()
    }
    previouslyActive.current = activeNow
  }, [uploads, prefix, load])

  const handleDownload = useCallback(
    async (item: S3ObjectSummary) => {
      if (!prefix || !worktreePath || !window.api.s3?.downloadObject) {
        return
      }
      const relPath = relativePathFromS3Key(prefix, item.key)
      if (!relPath) {
        return
      }
      setBusyKey(item.key)
      try {
        const result = await window.api.s3.downloadObject({
          key: item.key,
          targetPath: joinPath(worktreePath, relPath)
        })
        if (result.ok) {
          toast.success(
            translate(
              'auto.components.right.sidebar.S3ObjectBrowserSection.downloaded',
              'Downloaded {name} from S3',
              { name: relPath }
            )
          )
        } else {
          toast.error(result.error)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        setBusyKey(null)
      }
    },
    [prefix, worktreePath]
  )

  const handleDelete = useCallback(async (item: S3ObjectSummary) => {
    if (!window.api.s3?.deleteObject) {
      return
    }
    setBusyKey(item.key)
    try {
      const result = await window.api.s3.deleteObject({ key: item.key })
      if (result.ok) {
        setItems((current) => current.filter((entry) => entry.key !== item.key))
        toast.success(
          translate(
            'auto.components.right.sidebar.S3ObjectBrowserSection.deleted',
            'Deleted {name} from S3',
            { name: item.key }
          )
        )
      } else {
        toast.error(result.error)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyKey(null)
    }
  }, [])

  if (!window.api.s3?.listObjects) {
    return null
  }

  return (
    <div className="shrink-0 border-t border-sidebar-border bg-sidebar">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="group flex items-center gap-0.5 pr-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
            >
              {open ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <HardDrive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {translate(
                  'auto.components.right.sidebar.S3ObjectBrowserSection.header',
                  'S3 Uploads'
                )}
              </span>
              {open ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">{items.length}</span>
              ) : null}
            </button>
          </CollapsibleTrigger>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            disabled={loading}
            onClick={() => void load()}
            title={translate(
              'auto.components.right.sidebar.S3ObjectBrowserSection.reload',
              'Reload objects'
            )}
          >
            <RefreshCw className={loading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
          </Button>
        </div>
        <CollapsibleContent>
          <div className="max-h-48 overflow-y-auto scrollbar-sleek px-1 pb-2">
            <S3FilterBar
              repoLabel={identity ? `${identity.owner}/${identity.repo}` : 'Repo'}
              branchLabel={branchNameSafe}
              scope={scope}
              onScopeChange={setScope}
            />
            <p className="px-3 pt-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground/70">
              {prefix ??
                translate(
                  'auto.components.right.sidebar.S3ObjectBrowserSection.noPrefix',
                  'No repo/branch selected.'
                )}
            </p>
            {uploads.length > 0 ? (
              <ul className="space-y-1.5 px-1 pt-1.5">
                {uploads.map((entry) => (
                  <S3UploadProgressRow key={entry.uploadId} entry={entry} />
                ))}
              </ul>
            ) : null}
            {loading && items.length === 0 ? (
              <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                <LoaderCircle className="mx-auto mb-1 h-3.5 w-3.5 animate-spin" />
                {translate(
                  'auto.components.right.sidebar.S3ObjectBrowserSection.loading',
                  'Loading…'
                )}
              </div>
            ) : loadError ? (
              <div className="px-3 py-3 text-center text-[11px] text-destructive">{loadError}</div>
            ) : items.length === 0 ? (
              <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.right.sidebar.S3ObjectBrowserSection.empty',
                  'No S3 uploads for this project and branch yet.'
                )}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const relPath = prefix ? relativePathFromS3Key(prefix, item.key) : item.key
                  return (
                    <li
                      key={item.key}
                      className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-sidebar-accent"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] text-foreground">
                          {relPath}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {formatBytes(item.size)}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        disabled={busyKey === item.key}
                        onClick={() => void handleDownload(item)}
                        title={translate(
                          'auto.components.right.sidebar.S3ObjectBrowserSection.download',
                          'Download to worktree'
                        )}
                      >
                        {busyKey === item.key ? (
                          <LoaderCircle className="h-3 w-3 animate-spin" />
                        ) : (
                          <CloudDownload className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={busyKey === item.key}
                        onClick={() => void handleDelete(item)}
                        title={translate(
                          'auto.components.right.sidebar.S3ObjectBrowserSection.delete',
                          'Delete from S3'
                        )}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
