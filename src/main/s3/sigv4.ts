/**
 * SigV4 signing for S3-compatible storage, shared by uploads and object ops.
 */
import { createHmac, createHash } from 'node:crypto'
import { ensureElectronProxyFromEnvironment } from '../network/proxy-settings'
import type { S3ConnectionConfig } from '../../shared/s3-types'

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

export function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex')
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%2F/gi, '/')
}

/** Object key → canonical URI (each segment encoded, slashes preserved). */
export function canonicalUri(key: string): string {
  return key
    .split('/')
    .map((segment) => encodePathSegment(segment))
    .join('/')
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, dateStamp)
  const regionKey = hmac(dateKey, region)
  const serviceKey = hmac(regionKey, 's3')
  return hmac(serviceKey, 'aws4_request')
}

/**
 * Resolve the PUT host for the bucket. AWS buckets default to virtual-hosted
 * style; custom endpoints (MinIO, R2, …) default to path-style unless the
 * user explicitly opts out via forcePathStyle. When the endpoint already
 * carries a path (e.g. R2 "…/bucket-name" URLs), that path is kept instead of
 * re-appending the bucket, so an endpoint pasted from the R2 dashboard works.
 */
export function resolveHost(config: S3ConnectionConfig): { host: string; pathPrefix: string } {
  const isAws = config.endpoint.endsWith('amazonaws.com')
  const pathStyle = config.forcePathStyle ?? !isAws
  const normalized = config.endpoint.replace(/\/+$/, '')
  if (pathStyle) {
    let host: string
    let endpointPath = ''
    try {
      const url = new URL(normalized.startsWith('http') ? normalized : `https://${normalized}`)
      host = url.host
      endpointPath = url.pathname.replace(/\/+$/, '')
    } catch {
      host = normalized.replace(/^https?:\/\//, '')
    }
    // Why: an endpoint like …r2.cloudflarestorage.com/my-bucket already pins
    // the bucket; doubling it would 404. Keep the caller-supplied path verbatim.
    if (endpointPath && endpointPath !== '/' && endpointPath !== `/${config.bucket}`) {
      return { host, pathPrefix: endpointPath }
    }
    return { host, pathPrefix: `/${config.bucket}` }
  }
  // virtual-hosted: https://bucket.s3.region.amazonaws.com
  const base = normalized.replace(/^https?:\/\//, '')
  const host = `${config.bucket}.${base}`
  return { host, pathPrefix: '' }
}

export function signedRequestHeaders(
  config: S3ConnectionConfig,
  host: string,
  method: 'PUT' | 'HEAD' | 'GET' | 'DELETE',
  uri: string,
  payloadHash: string,
  canonicalQuery = ''
): Record<string, string> {
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = config.region || 'us-east-1'

  // Why: Host must be part of the SigV4 canonical request, but sending it as
  // a request header is forbidden by the Fetch spec (Chromium rejects it with
  // ERR_INVALID_ARGUMENT). net.fetch sets Host itself from the URL, so we sign
  // with it but strip it from the headers actually sent.
  const canonicalHeaders: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  }
  const signedHeaderNames = Object.keys(canonicalHeaders).sort()
  const canonicalHeaderString = signedHeaderNames
    .map((h) => `${h}:${canonicalHeaders[h]}\n`)
    .join('')
  const signedHeaders = signedHeaderNames.join(';')

  const canonicalRequest = [
    method,
    uri,
    canonicalQuery,
    canonicalHeaderString,
    signedHeaders,
    payloadHash
  ].join('\n')

  const scope = `${dateStamp}/${region}/s3/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n')

  const signature = hmac(
    signingKey(config.secretAccessKey, dateStamp, region),
    stringToSign
  ).toString('hex')

  return {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  }
}

export type ResolvedBucket = { host: string; pathPrefix: string; base: string }

export async function resolveBucket(config: S3ConnectionConfig): Promise<ResolvedBucket> {
  await ensureElectronProxyFromEnvironment()
  const { host, pathPrefix } = resolveHost(config)
  const protocol = config.endpoint.startsWith('http') ? new URL(config.endpoint).protocol : 'https:'
  return { host, pathPrefix, base: `${protocol}//${host}${pathPrefix}` }
}

// Why: AWS signs the *full* request path (including any endpoint-embedded
// bucket prefix like R2's …/my-bucket), so the canonical URI and the URL we
// fetch must always agree or R2 rejects the signature.
export function requestUri(r: ResolvedBucket, resourceUri: string): string {
  return `${r.pathPrefix}${resourceUri}`
}

// Why: SigV4 canonical query strings must be sorted and URI-encoded the same
// way in both the signature and the request URL.
export function encodeQueryParam(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+')
}

export function canonicalQueryString(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeQueryParam(key)}=${encodeQueryParam(params[key])}`)
    .join('&')
}
