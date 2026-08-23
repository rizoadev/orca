import type { RemoteSyncFileEntry } from '../../../shared/remote-sync-types'

export type RemoteObjectInfo = { size: number; lastModifiedSeconds: number }

export type SyncPlan = {
  /** Files that must be uploaded (missing, size-changed, or newer remotely). */
  planned: RemoteSyncFileEntry[]
  matchedFiles: number
}

/**
 * Match rule: an object counts as synced when the key exists with the same
 * size and the object's LastModified is at or after the remote file's mtime
 * (minus a small clock-skew allowance). ListObjectsV2 does not return custom
 * metadata, so no per-file HEAD round-trips are needed.
 */
const CLOCK_SKEW_ALLOWANCE_SECONDS = 2

export function planSync(args: {
  remoteFiles: RemoteSyncFileEntry[]
  prefix: string
  objectsByKey: Map<string, RemoteObjectInfo>
}): SyncPlan {
  const prefix = normalizePrefix(args.prefix)
  const planned: RemoteSyncFileEntry[] = []
  let matchedFiles = 0
  for (const file of args.remoteFiles) {
    const key = `${prefix}${file.relativePath}`
    const existing = args.objectsByKey.get(key)
    if (
      existing !== undefined &&
      existing.size === file.size &&
      existing.lastModifiedSeconds >= file.mtimeSeconds - CLOCK_SKEW_ALLOWANCE_SECONDS
    ) {
      matchedFiles += 1
      continue
    }
    planned.push(file)
  }
  return { planned, matchedFiles }
}

/** Object keys always use forward slashes and the prefix ends with one (or is empty). */
export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+/, '').replace(/\\+/g, '/')
  if (trimmed.length === 0 || trimmed.endsWith('/')) {
    return trimmed
  }
  return `${trimmed}/`
}
