/**
 * Hive env-files, stream history, deploy-by-env-id, credential probe.
 */
import type { HiveApiResult, HiveEnvFile, HiveStreamLogLine } from '../../shared/hive-types'
import { setHiveCredentialTenantName } from './credential-store'
import { hiveFetch } from './client-fetch'
import { asArray, asRecord, mapEnvFile, mapStreamLine } from './client-mappers'
import { hiveListProjects } from './client'

export async function hiveGetEnvFiles(
  credentialId: string,
  projectId: string,
  envId: string
): Promise<HiveApiResult<HiveEnvFile[]>> {
  const result = await hiveFetch(
    credentialId,
    `/deploy/project/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(envId)}/env-files`
  )
  if (!result.ok) {
    return result
  }
  const list = Array.isArray(result.data)
    ? result.data
    : asArray(asRecord(result.data)?.files ?? asRecord(result.data)?.items)
  const files = list.map(mapEnvFile).filter((f): f is HiveEnvFile => f !== null)
  return { ok: true, data: files }
}

export async function hiveSaveEnvFiles(
  credentialId: string,
  projectId: string,
  envId: string,
  files: { path: string; content: string }[]
): Promise<HiveApiResult<HiveEnvFile[]>> {
  const result = await hiveFetch(
    credentialId,
    `/deploy/project/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(envId)}/env-files`,
    {
      method: 'PUT',
      body: JSON.stringify({ files })
    }
  )
  if (!result.ok) {
    return result
  }
  const list = Array.isArray(result.data)
    ? result.data
    : asArray(asRecord(result.data)?.files ?? asRecord(result.data)?.items)
  if (list.length > 0) {
    const mapped = list.map(mapEnvFile).filter((f): f is HiveEnvFile => f !== null)
    return { ok: true, data: mapped }
  }
  return hiveGetEnvFiles(credentialId, projectId, envId)
}

export async function hiveStreamHistory(
  credentialId: string,
  projectId: string,
  opts?: { env?: string; limit?: number }
): Promise<HiveApiResult<HiveStreamLogLine[]>> {
  const q = new URLSearchParams()
  if (opts?.env) {
    q.set('env', opts.env)
  }
  q.set('limit', String(opts?.limit ?? 100))
  const result = await hiveFetch(
    credentialId,
    `/deploy/project/${encodeURIComponent(projectId)}/stream-history?${q.toString()}`
  )
  if (!result.ok) {
    return result
  }
  const rec = asRecord(result.data)
  const list = Array.isArray(result.data)
    ? result.data
    : asArray(rec?.lines ?? rec?.items ?? rec?.steps)
  const lines = list.map(mapStreamLine).filter((l): l is HiveStreamLogLine => l !== null)
  return { ok: true, data: lines }
}

export async function hiveDeployEnvironment(
  credentialId: string,
  projectId: string,
  envId: string,
  asyncMode = true
): Promise<HiveApiResult<unknown>> {
  const suffix = asyncMode ? 'deploy-async' : 'deploy'
  return hiveFetch(
    credentialId,
    `/deploy/project/${encodeURIComponent(projectId)}/environments/${encodeURIComponent(envId)}/${suffix}`,
    { method: 'POST' }
  )
}

/** Best-effort tenant label from /auth/me when available. */
export async function hiveProbeCredential(
  credentialId: string
): Promise<HiveApiResult<string | null>> {
  const result = await hiveFetch(credentialId, '/auth/me')
  if (!result.ok) {
    const projects = await hiveListProjects(credentialId)
    if (!projects.ok) {
      return projects
    }
    return { ok: true, data: null }
  }
  const rec = asRecord(result.data)
  const tenantName =
    typeof rec?.tenant_name === 'string'
      ? rec.tenant_name
      : typeof rec?.tenantName === 'string'
        ? rec.tenantName
        : typeof asRecord(rec?.tenant)?.name === 'string'
          ? (asRecord(rec?.tenant)?.name as string)
          : null
  if (tenantName) {
    setHiveCredentialTenantName(credentialId, tenantName)
  }
  return { ok: true, data: tenantName }
}
