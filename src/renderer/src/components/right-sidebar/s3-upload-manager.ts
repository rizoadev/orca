/**
 * Module-level store for in-flight S3 uploads, powering the progress dialog.
 * The FileExplorer starts/uploads/ends entries here; the dialog subscribes so
 * multi-upload progress stays in one place instead of many toasts.
 */
import type { S3UploadProgress } from '../../../../shared/s3-types'

export type S3UploadStatus = 'uploading' | 'done' | 'error'

export type S3UploadEntry = {
  uploadId: string
  filePath: string
  objectKey: string
  status: S3UploadStatus
  bytesUploaded: number
  totalBytes: number
  error?: string
}

const entries = new Map<string, S3UploadEntry>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function startS3Upload(args: {
  uploadId: string
  filePath: string
  objectKey: string
}): void {
  entries.set(args.uploadId, {
    uploadId: args.uploadId,
    filePath: args.filePath,
    objectKey: args.objectKey,
    status: 'uploading',
    bytesUploaded: 0,
    totalBytes: 0
  })
  notify()
}

export function updateS3UploadProgress(progress: S3UploadProgress): void {
  // Why: the main process generates its own uploadId inside uploadFile, so
  // match entries by the file+key pair instead of the renderer's id.
  const entry = [...entries.values()].find(
    (candidate) =>
      candidate.filePath === progress.filePath && candidate.objectKey === progress.objectKey
  )
  if (!entry || entry.status !== 'uploading') {
    return
  }
  entry.bytesUploaded = progress.bytesUploaded
  entry.totalBytes = progress.totalBytes
  notify()
}

export function completeS3Upload(uploadId: string): void {
  const entry = entries.get(uploadId)
  if (!entry) {
    return
  }
  entry.status = 'done'
  entry.bytesUploaded = entry.totalBytes || entry.bytesUploaded
  notify()
}

export function failS3Upload(uploadId: string, error: string): void {
  const entry = entries.get(uploadId)
  if (!entry) {
    return
  }
  entry.status = 'error'
  entry.error = error
  notify()
}

export function removeS3Upload(uploadId: string): void {
  if (entries.delete(uploadId)) {
    notify()
  }
}

export function clearFinishedS3Uploads(): void {
  for (const [uploadId, entry] of entries) {
    if (entry.status !== 'uploading') {
      entries.delete(uploadId)
    }
  }
  notify()
}

export function getS3Uploads(): S3UploadEntry[] {
  return [...entries.values()]
}

export function subscribeS3Uploads(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetS3UploadStoreForTests(): void {
  entries.clear()
  listeners.clear()
}
