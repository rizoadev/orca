/**
 * Hive API response mappers + project payload flatten.
 */
import type {
  HiveBuildSummary,
  HiveEnvFile,
  HiveEnvironmentSummary,
  HiveProjectSummary,
  HiveStreamLogLine
} from '../../shared/hive-types'

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function pickString(r: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = r[key]
    if (typeof value === 'string') {
      return value
    }
  }
  return null
}

function pickNumber(r: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = r[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return null
}

export function mapProject(row: unknown): HiveProjectSummary | null {
  const r = asRecord(row)
  if (!r || typeof r.id !== 'string') {
    return null
  }
  const name =
    typeof r.name === 'string'
      ? r.name
      : typeof r.path_with_namespace === 'string'
        ? r.path_with_namespace
        : r.id
  return {
    id: r.id,
    name,
    pathWithNamespace:
      typeof r.path_with_namespace === 'string'
        ? r.path_with_namespace
        : typeof r.pathWithNamespace === 'string'
          ? r.pathWithNamespace
          : null
  }
}

export function mapEnvironment(row: unknown): HiveEnvironmentSummary | null {
  const r = asRecord(row)
  if (!r || typeof r.id !== 'string' || typeof r.name !== 'string') {
    return null
  }
  return {
    id: r.id,
    name: r.name,
    branch: pickString(r, 'branch'),
    port: pickNumber(r, 'port'),
    containerPort: pickNumber(r, 'container_port', 'containerPort'),
    domains: Array.isArray(r.domains) ? r.domains.filter((d) => typeof d === 'string') : [],
    status: pickString(r, 'status'),
    commitStatus: pickString(r, 'commit_status', 'commitStatus'),
    deployCommit: pickString(r, 'deploy_commit', 'deployCommit'),
    latestCommit: pickString(r, 'latest_commit', 'latestCommit'),
    serverHostname: pickString(r, 'server_hostname', 'serverHostname'),
    serverIp: pickString(r, 'server_ip', 'serverIp'),
    serverId: pickString(r, 'server_id', 'serverId'),
    image: pickString(r, 'image'),
    dockerfile: pickString(r, 'dockerfile'),
    buildContext: pickString(r, 'build_context', 'buildContext'),
    updatedAt: pickString(r, 'updated_at', 'updatedAt')
  }
}

function demangleSnippetEncodedPath(value: string): string {
  // Why: hive→GitLab snippet sync encodes nested paths as a__b for GitLab
  // file_path; only apply when no real slash path is present.
  if (value.includes('/')) {
    return value
  }
  return value.replaceAll('__', '/')
}

function pickEnvFilePath(r: Record<string, unknown>): string | null {
  const nested = asRecord(r.file)
  // Why: `path` is the Hive canonical field (e.g. app/readyou). Never prefer
  // GitLab-mangled file_name/filename when path exists.
  const direct = pickString(r, 'path')?.trim()
  if (direct) {
    return demangleSnippetEncodedPath(direct)
  }
  const nestedPath = nested ? pickString(nested, 'path')?.trim() : null
  if (nestedPath) {
    return demangleSnippetEncodedPath(nestedPath)
  }
  const fallback =
    pickString(r, 'name', 'file_path', 'filePath', 'filename', 'file_name') ??
    (nested ? pickString(nested, 'name', 'file_path', 'filePath', 'filename', 'file_name') : null)
  const trimmed = fallback?.trim()
  return trimmed ? demangleSnippetEncodedPath(trimmed) : null
}

function pickEnvFileContent(r: Record<string, unknown>): string {
  const candidates: unknown[] = [r.content, r.body, r.value, r.text, r.data]
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      return candidate
    }
  }
  const nested = asRecord(r.file)
  if (nested) {
    for (const key of ['content', 'body', 'value', 'text', 'data'] as const) {
      const value = nested[key]
      if (typeof value === 'string') {
        return value
      }
    }
  }
  return ''
}

export function mapEnvFile(row: unknown): HiveEnvFile | null {
  const r = asRecord(row)
  if (!r) {
    return null
  }
  const path = pickEnvFilePath(r)
  if (!path) {
    return null
  }
  return {
    path,
    content: pickEnvFileContent(r),
    gitlabSnippetId: pickString(
      r,
      'gitlab_snippet_id',
      'gitlabSnippetId',
      'snippet_id',
      'snippetId'
    ),
    gitlabSnippetWebUrl: pickString(
      r,
      'gitlab_snippet_web_url',
      'gitlabSnippetWebUrl',
      'snippet_web_url',
      'snippetWebUrl'
    )
  }
}

export function mapStreamLine(row: unknown): HiveStreamLogLine | null {
  const r = asRecord(row)
  if (!r) {
    return null
  }
  return {
    id: typeof r.id === 'string' ? r.id : undefined,
    parentId: pickString(r, 'parent_id', 'parentId'),
    task: pickString(r, 'task'),
    msg: pickString(r, 'msg', 'message'),
    level: pickString(r, 'level'),
    outcome: pickString(r, 'outcome'),
    runId: pickString(r, 'run_id', 'runId'),
    url: pickString(r, 'url'),
    commitSha: pickString(r, 'commit_sha', 'commitSha'),
    branch: pickString(r, 'branch'),
    env: pickString(r, 'env', 'env_name', 'envName'),
    createdAt: pickString(r, 'created_at', 'createdAt'),
    parentStatus: pickString(r, 'parent_status', 'parentStatus'),
    raw: r
  }
}

export function mapBuild(row: unknown): HiveBuildSummary | null {
  if (row == null) {
    return null
  }
  const r = asRecord(row)
  if (!r || typeof r.id !== 'string') {
    return null
  }
  return {
    id: r.id,
    runId: typeof r.run_id === 'string' ? r.run_id : typeof r.runId === 'string' ? r.runId : null,
    task: typeof r.task === 'string' ? r.task : null,
    msg: typeof r.msg === 'string' ? r.msg : null,
    status: typeof r.status === 'string' ? r.status : null,
    createdAt:
      typeof r.created_at === 'string'
        ? r.created_at
        : typeof r.createdAt === 'string'
          ? r.createdAt
          : null
  }
}

/**
 * Hive GET /project returns `data` as either:
 * - flat project array, or
 * - map of group_name → project[] (current hive-v3)
 */
export function flattenHiveProjectPayload(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw
  }
  const rec = asRecord(raw)
  if (!rec) {
    return []
  }
  if (Array.isArray(rec.projects)) {
    return rec.projects
  }
  if (Array.isArray(rec.items)) {
    return rec.items
  }
  if (Array.isArray(rec.results)) {
    return rec.results
  }
  if (Array.isArray(rec.data)) {
    return rec.data
  }
  // Why: hive-v3 groups projects by group_name: { "Acme": [project, ...], "_ungrouped": [...] }
  const grouped: unknown[] = []
  for (const value of Object.values(rec)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (asRecord(entry)?.id) {
          grouped.push(entry)
        }
      }
    }
  }
  return grouped
}
