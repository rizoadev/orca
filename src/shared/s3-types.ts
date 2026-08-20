/** S3-compatible object storage connection + upload types (right-sidebar explorer). */

export type S3ConnectionConfig = {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  /** Force path-style URLs for S3-compatible stores that lack virtual-host support. */
  forcePathStyle?: boolean
}

/** Status surfaced to settings; never includes the secret key. */
export type S3ConnectionStatus = {
  connected: boolean
  endpoint: string | null
  region: string | null
  bucket: string | null
  credentialError?: string
}

export type S3ConnectArgs = S3ConnectionConfig

export type S3TestResult = { ok: true } | { ok: false; error: string }

export type S3UploadArgs = {
  filePath: string
  objectKey: string
}

export type S3UploadProgress = {
  uploadId: string
  filePath: string
  objectKey: string
  bytesUploaded: number
  totalBytes: number
}

export type S3UploadResult =
  | { ok: true; objectKey: string; size: number }
  | { ok: false; error: string }

/** One object listed from the bucket under a project prefix. */
export type S3ObjectSummary = {
  key: string
  size: number
  lastModified: string
}

export type S3ListArgs = {
  /** Object-key prefix to list under (e.g. "my-project/"). */
  prefix: string
}

export type S3ListResult = { ok: true; items: S3ObjectSummary[] } | { ok: false; error: string }

export type S3ObjectActionArgs = {
  key: string
}

export type S3ObjectActionResult = { ok: true; key: string } | { ok: false; error: string }

export type S3DownloadObjectResult =
  | { ok: true; key: string; size: number }
  | { ok: false; error: string }
