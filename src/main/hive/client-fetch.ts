/**
 * Shared Hive HTTP fetch + envelope unwrap.
 */
import type { HiveApiResult } from '../../shared/hive-types'
import { markHiveCredentialInvalid, resolveHiveAuth } from './credential-store'

type Envelope = {
  success?: boolean
  data?: unknown
  message?: string
  detail?: string
}

export async function hiveFetch(
  credentialId: string,
  path: string,
  init?: RequestInit
): Promise<HiveApiResult<unknown>> {
  const auth = resolveHiveAuth(credentialId)
  if (!auth) {
    return { ok: false, error: 'Hive credential missing or could not be decrypted' }
  }
  const url = `${auth.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${auth.token}`
    }
    if (init?.body) {
      headers['Content-Type'] = 'application/json'
    }
    if (init?.headers) {
      Object.assign(headers, init.headers)
    }
    const response = await fetch(url, {
      ...init,
      headers
    })
    const text = await response.text()
    let body: Envelope | null = null
    if (text) {
      try {
        body = JSON.parse(text) as Envelope
      } catch {
        body = null
      }
    }
    if (response.status === 401) {
      markHiveCredentialInvalid(credentialId)
      return {
        ok: false,
        error: body?.detail || body?.message || 'Unauthorized — check token',
        status: 401
      }
    }
    if (!response.ok) {
      return {
        ok: false,
        error: body?.detail || body?.message || `HTTP ${response.status}`,
        status: response.status
      }
    }
    if (body && body.success === false) {
      return { ok: false, error: body.detail || body.message || 'Request failed' }
    }
    return { ok: true, data: body?.data !== undefined ? body.data : body }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
