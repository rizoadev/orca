/**
 * S3-compatible object storage client for the right-sidebar explorer uploads.
 * Config stored encrypted under ~/.orca/s3-config.enc (safeStorage, same
 * pattern as Asana/Jira). Uploads stream the file with SigV4-signed PUT so
 * multi-GB backups never load into renderer memory.
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { Readable, Transform } from 'node:stream'
import { net, safeStorage } from 'electron'
import type {
  S3ConnectionConfig,
  S3ConnectionStatus,
  S3ConnectArgs,
  S3TestResult,
  S3UploadArgs,
  S3UploadProgress,
  S3UploadResult
} from '../../shared/s3-types'
import { boundedIntegrationErrorMessage } from '../integration-error-message'
import { canonicalUri, requestUri, resolveBucket, sha256Hex, signedRequestHeaders } from './sigv4'

export { listObjects, deleteObject, downloadObject } from './s3-object-ops'
export type {
  S3ObjectActionResult,
  S3DownloadObjectResult,
  S3ListResult
} from '../../shared/s3-types'

const MAX_CONFIG_BYTES = 16_384

let cachedConfig: S3ConnectionConfig | null = null
let credentialError: string | null = null

function getConfigPath(): string {
  return join(homedir(), '.orca', 's3-config.enc')
}

function ensureOrcaDir(): void {
  const dir = join(homedir(), '.orca')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function loadConfig(): S3ConnectionConfig | null {
  if (cachedConfig) {
    return cachedConfig
  }
  const path = getConfigPath()
  if (!existsSync(path)) {
    return null
  }
  try {
    const raw = readFileSync(path)
    const json = safeStorage.isEncryptionAvailable()
      ? (() => {
          try {
            return safeStorage.decryptString(raw)
          } catch {
            // legacy plaintext JSON written when encryption was unavailable
            return raw.toString('utf8')
          }
        })()
      : raw.toString('utf8')
    const parsed = JSON.parse(json) as S3ConnectionConfig
    if (
      typeof parsed.endpoint !== 'string' ||
      typeof parsed.bucket !== 'string' ||
      typeof parsed.accessKeyId !== 'string' ||
      typeof parsed.secretAccessKey !== 'string'
    ) {
      throw new Error('Incomplete S3 config')
    }
    cachedConfig = parsed
    credentialError = null
    return parsed
  } catch (err) {
    credentialError = err instanceof Error ? err.message : String(err)
    return null
  }
}

export function storeConfig(config: S3ConnectionConfig): void {
  ensureOrcaDir()
  const json = JSON.stringify(config)
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json)
    if (encrypted.byteLength > MAX_CONFIG_BYTES) {
      throw new Error(`S3 encrypted config exceeds ${MAX_CONFIG_BYTES} bytes.`)
    }
    writeFileSync(getConfigPath(), encrypted)
  } else {
    console.warn('[s3] safeStorage encryption unavailable — storing config in plaintext')
    writeFileSync(getConfigPath(), json, 'utf8')
  }
  cachedConfig = config
  credentialError = null
}

function clearConfig(): void {
  cachedConfig = null
  credentialError = null
  try {
    if (existsSync(getConfigPath())) {
      unlinkSync(getConfigPath())
    }
  } catch {
    // ignore
  }
}

export function getConfig(): S3ConnectionConfig | null {
  return loadConfig()
}

export function getStatus(): S3ConnectionStatus {
  const config = loadConfig()
  const connected = config !== null && credentialError === null
  return {
    connected,
    endpoint: config?.endpoint ?? null,
    region: config?.region ?? null,
    bucket: config?.bucket ?? null,
    ...(credentialError ? { credentialError } : {})
  }
}

export async function testConnection(config: S3ConnectionConfig): Promise<S3TestResult> {
  try {
    const bucket = await resolveBucket(config)
    const uri = requestUri(bucket, '')
    const payloadHash = sha256Hex('')
    const headers = signedRequestHeaders(config, bucket.host, 'HEAD', uri, payloadHash)
    const res = await net.fetch(bucket.base, { method: 'HEAD', headers })
    if (res.ok || res.status === 403) {
      // 403 = bucket exists but listing denied; credentials are valid enough to proceed.
      return { ok: true }
    }
    return { ok: false, error: `S3 responded ${res.status} ${res.statusText}` }
  } catch (err) {
    return {
      ok: false,
      error: boundedIntegrationErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }
}

/**
 * Stream a local file into the bucket with a single signed PUT.
 * Progress is reported via onProgress; big files never hit renderer memory.
 */
export async function uploadFile(
  args: S3UploadArgs,
  onProgress?: (progress: S3UploadProgress) => void
): Promise<S3UploadResult> {
  const config = loadConfig()
  if (!config) {
    return { ok: false, error: 'S3 is not connected. Configure it in Settings → Integrations.' }
  }
  const filePath = args.filePath
  try {
    if (!existsSync(filePath)) {
      return { ok: false, error: `File not found: ${filePath}` }
    }
    const { size } = statSync(filePath)
    const key = args.objectKey.replace(/^\/+/, '')
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    const bucket = await resolveBucket(config)
    const resourceUri = `/${canonicalUri(key)}`
    const uri = requestUri(bucket, resourceUri)
    const payloadHash = 'UNSIGNED-PAYLOAD'
    const headers = signedRequestHeaders(config, bucket.host, 'PUT', uri, payloadHash)
    headers['Content-Length'] = String(size)

    // Why: the counting Transform sits inside the pipe (read → count → fetch
    // body) so exactly one consumer sees the bytes; a separate 'data' listener
    // on the same stream would fight Readable.toWeb for chunks. Uploads use
    // undici's global fetch — Electron's net.fetch (Chromium) rejects a stream
    // body combined with a manual Content-Length (ERR_INVALID_ARGUMENT).
    const readStream = createReadStream(filePath)
    let sent = 0
    let lastEmitAt = 0
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sent += chunk.byteLength
        const now = Date.now()
        if (onProgress && (now - lastEmitAt >= 200 || sent >= size)) {
          lastEmitAt = now
          onProgress({ uploadId, filePath, objectKey: key, bytesUploaded: sent, totalBytes: size })
        }
        callback(null, chunk)
      }
    })
    readStream.pipe(counter)

    const body = Readable.toWeb(counter) as unknown as BodyInit
    const res = await fetch(`${bucket.base}${resourceUri}`, {
      method: 'PUT',
      headers,
      body,
      duplex: 'half'
    } as RequestInit)
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return {
        ok: false,
        error: `S3 upload failed (${res.status} ${res.statusText})${detail ? `: ${detail.slice(0, 300)}` : ''}`
      }
    }
    onProgress?.({ uploadId, filePath, objectKey: key, bytesUploaded: size, totalBytes: size })
    return { ok: true, objectKey: key, size }
  } catch (err) {
    return {
      ok: false,
      error: boundedIntegrationErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }
}

export async function connect(args: S3ConnectArgs): Promise<S3ConnectionStatus> {
  const config: S3ConnectionConfig = {
    endpoint: args.endpoint.trim().replace(/\/+$/, ''),
    region: args.region.trim() || 'us-east-1',
    bucket: args.bucket.trim(),
    accessKeyId: args.accessKeyId.trim(),
    secretAccessKey: args.secretAccessKey.trim(),
    forcePathStyle: args.forcePathStyle
  }
  if (!config.endpoint || !config.bucket || !config.accessKeyId || !config.secretAccessKey) {
    throw new Error('Endpoint, bucket, access key, and secret key are required.')
  }
  const test = await testConnection(config)
  if (!test.ok) {
    throw new Error(test.error)
  }
  storeConfig(config)
  return getStatus()
}

export function disconnect(): S3ConnectionStatus {
  clearConfig()
  return getStatus()
}
