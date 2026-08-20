/**
 * S3 object list/delete/download, separate from upload so the config+signing
 * module stays under the max-lines budget. Uses undici's global fetch for all
 * object operations (net.fetch rejects stream bodies with manual lengths).
 */
import { createWriteStream, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { Readable, pipeline } from 'node:stream'
import { boundedIntegrationErrorMessage } from '../integration-error-message'
import type {
  S3ObjectActionResult,
  S3DownloadObjectResult,
  S3ListResult,
  S3ObjectSummary
} from '../../shared/s3-types'
import { getConfig } from './client'
import {
  canonicalQueryString,
  canonicalUri,
  resolveBucket,
  requestUri,
  sha256Hex,
  signedRequestHeaders
} from './sigv4'

export async function listObjects(args: { prefix: string }): Promise<S3ListResult> {
  const config = getConfig()
  if (!config) {
    return { ok: false, error: 'S3 is not connected.' }
  }
  try {
    const bucket = await resolveBucket(config)
    const query = canonicalQueryString({
      'list-type': '2',
      'max-keys': '1000',
      prefix: args.prefix.replace(/^\/+/g, '')
    })
    const uri = requestUri(bucket, '/')
    const payloadHash = sha256Hex('')
    const headers = signedRequestHeaders(config, bucket.host, 'GET', uri, payloadHash, query)
    const res = await fetch(`${bucket.base}/?${query}`, { method: 'GET', headers })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return {
        ok: false,
        error: `S3 list failed (${res.status} ${res.statusText})${detail ? `: ${detail.slice(0, 300)}` : ''}`
      }
    }
    const xml = await res.text()
    // Why: ListObjectsV2 XML is small and stable; a light regex parse avoids
    // pulling in an XML dependency just for <Key>/<Size>/<LastModified>.
    const items = parseListObjectsXml(xml)
    return { ok: true, items }
  } catch (err) {
    return {
      ok: false,
      error: boundedIntegrationErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }
}

export function parseListObjectsXml(xml: string): S3ObjectSummary[] {
  const contents = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) ?? []
  return contents
    .map((block) => {
      const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] ?? ''
      const size = Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] ?? 0)
      const lastModified = block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] ?? ''
      return { key, size, lastModified }
    })
    .filter((item) => item.key.length > 0)
    .sort((a, b) => a.key.localeCompare(b.key))
}

export async function deleteObject(args: { key: string }): Promise<S3ObjectActionResult> {
  const config = getConfig()
  if (!config) {
    return { ok: false, error: 'S3 is not connected.' }
  }
  try {
    const bucket = await resolveBucket(config)
    const resourceUri = `/${canonicalUri(args.key)}`
    const uri = requestUri(bucket, resourceUri)
    const payloadHash = sha256Hex('')
    const headers = signedRequestHeaders(config, bucket.host, 'DELETE', uri, payloadHash)
    const res = await fetch(`${bucket.base}${resourceUri}`, { method: 'DELETE', headers })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return {
        ok: false,
        error: `S3 delete failed (${res.status} ${res.statusText})${detail ? `: ${detail.slice(0, 300)}` : ''}`
      }
    }
    return { ok: true, key: args.key }
  } catch (err) {
    return {
      ok: false,
      error: boundedIntegrationErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }
}

export async function downloadObject(args: {
  key: string
  targetPath: string
}): Promise<S3DownloadObjectResult> {
  const config = getConfig()
  if (!config) {
    return { ok: false, error: 'S3 is not connected.' }
  }
  try {
    const bucket = await resolveBucket(config)
    const resourceUri = `/${canonicalUri(args.key)}`
    const uri = requestUri(bucket, resourceUri)
    const payloadHash = sha256Hex('')
    const headers = signedRequestHeaders(config, bucket.host, 'GET', uri, payloadHash)
    const res = await fetch(`${bucket.base}${resourceUri}`, { method: 'GET', headers })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return {
        ok: false,
        error: `S3 download failed (${res.status} ${res.statusText})${detail ? `: ${detail.slice(0, 300)}` : ''}`
      }
    }
    const body = res.body
    if (!body) {
      return { ok: false, error: 'S3 returned an empty body.' }
    }
    const size = Number(res.headers.get('content-length') ?? 0)
    // Why: stream the remote object straight to disk (web stream → node
    // stream) so multi-GB backups never land in renderer memory.
    mkdirSync(dirname(args.targetPath), { recursive: true })
    await new Promise<void>((resolve, reject) => {
      pipeline(Readable.fromWeb(body as never), createWriteStream(args.targetPath), (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
    return { ok: true, key: args.key, size }
  } catch (err) {
    return {
      ok: false,
      error: boundedIntegrationErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }
}
