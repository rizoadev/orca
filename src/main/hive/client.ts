/**
 * Minimal Hive v3 HTTP client for Orca sidebar (projects, builds, deploy-by-name).
 */
import type {
  HiveApiResult,
  HiveBuildSummary,
  HiveEnvironmentSummary,
  HiveProjectSummary
} from '../../shared/hive-types'
import { hiveFetch } from './client-fetch'
import {
  asArray,
  asRecord,
  flattenHiveProjectPayload,
  mapBuild,
  mapEnvironment,
  mapProject
} from './client-mappers'

export { flattenHiveProjectPayload } from './client-mappers'
export {
  hiveDeployEnvironment,
  hiveGetEnvFiles,
  hiveProbeCredential,
  hiveSaveEnvFiles,
  hiveStreamHistory
} from './client-env-ops'

export async function hiveListProjects(
  credentialId: string
): Promise<HiveApiResult<HiveProjectSummary[]>> {
  const result = await hiveFetch(credentialId, '/project')
  if (!result.ok) {
    return result
  }
  const list = flattenHiveProjectPayload(result.data)
  const projects = list.map(mapProject).filter((p): p is HiveProjectSummary => p !== null)
  return { ok: true, data: projects }
}

export async function hiveListEnvironments(
  credentialId: string,
  projectId: string
): Promise<HiveApiResult<HiveEnvironmentSummary[]>> {
  const result = await hiveFetch(
    credentialId,
    `/deploy/project/${encodeURIComponent(projectId)}/environments`
  )
  if (!result.ok) {
    return result
  }
  const raw = result.data
  const list = Array.isArray(raw)
    ? raw
    : asArray(asRecord(raw)?.environments ?? asRecord(raw)?.items)
  const envs = list.map(mapEnvironment).filter((e): e is HiveEnvironmentSummary => e !== null)
  return { ok: true, data: envs }
}

export async function hiveLatestBuild(
  credentialId: string,
  projectId: string
): Promise<HiveApiResult<HiveBuildSummary | null>> {
  const result = await hiveFetch(
    credentialId,
    `/deploy/project/${encodeURIComponent(projectId)}/build`
  )
  if (!result.ok) {
    return result
  }
  const rec = asRecord(result.data)
  const build = mapBuild(rec?.build ?? result.data)
  return { ok: true, data: build }
}

export async function hiveTriggerBuild(
  credentialId: string,
  projectId: string
): Promise<HiveApiResult<{ status?: string; buildId?: string }>> {
  const result = await hiveFetch(
    credentialId,
    `/deploy/project/${encodeURIComponent(projectId)}/build`,
    { method: 'POST' }
  )
  if (!result.ok) {
    return result
  }
  const rec = asRecord(result.data)
  return {
    ok: true,
    data: {
      status: typeof rec?.status === 'string' ? rec.status : undefined,
      buildId:
        typeof rec?.build_id === 'string'
          ? rec.build_id
          : typeof rec?.buildId === 'string'
            ? rec.buildId
            : undefined
    }
  }
}

export async function hiveTriggerDeploy(
  credentialId: string,
  projectId: string,
  env = 'dev'
): Promise<HiveApiResult<{ status?: string; deployId?: string }>> {
  const q = new URLSearchParams({ env })
  const result = await hiveFetch(
    credentialId,
    `/deploy/project/${encodeURIComponent(projectId)}/deploy?${q.toString()}`,
    { method: 'POST' }
  )
  if (!result.ok) {
    return result
  }
  const rec = asRecord(result.data)
  return {
    ok: true,
    data: {
      status: typeof rec?.status === 'string' ? rec.status : undefined,
      deployId:
        typeof rec?.deploy_id === 'string'
          ? rec.deploy_id
          : typeof rec?.deployId === 'string'
            ? rec.deployId
            : undefined
    }
  }
}

export async function hiveDispatch(
  credentialId: string,
  projectId: string,
  body: {
    tipe?: 'build' | 'deploy'
    branch?: string
    commit?: string
    workflow?: string
  }
): Promise<HiveApiResult<unknown>> {
  return hiveFetch(credentialId, `/deploy/project/${encodeURIComponent(projectId)}/dispatch`, {
    method: 'POST',
    body: JSON.stringify({
      tipe: body.tipe ?? 'build',
      ...(body.branch ? { branch: body.branch } : {}),
      ...(body.commit ? { commit: body.commit } : {}),
      workflow: body.workflow ?? 'hive-build.yml'
    })
  })
}
