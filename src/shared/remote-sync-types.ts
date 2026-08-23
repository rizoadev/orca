export type RemoteSyncConfig = {
  id: string
  targetId: string
  /** Absolute remote directory to mirror into the bucket. */
  remoteRoot: string
  /** Object-key prefix under the bucket; trailing slash normalized. */
  prefix: string
}

export type RemoteSyncFileEntry = {
  relativePath: string
  size: number
  mtimeSeconds: number
}

export type RemoteSyncRunStatus = 'planning' | 'uploading' | 'done' | 'canceled' | 'error'

export type RemoteSyncProgress = {
  runId: string
  configId: string
  status: RemoteSyncRunStatus
  dryRun: boolean
  totalFiles: number
  matchedFiles: number
  plannedFiles: number
  uploadedFiles: number
  failedFiles: number
  currentFile: string | null
  error: string | null
}
