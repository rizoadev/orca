/** Hive v3 integration types (API tokens + per-repo binding). */

export type HiveCredentialPublic = {
  id: string
  label: string
  baseUrl: string
  tokenPrefix: string
  tenantName?: string
  createdAt: number
  lastUsedAt?: number
  status: 'active' | 'invalid'
}

export type HiveRepoBinding = {
  credentialId: string
  projectId: string
  projectName?: string
  defaultEnv?: string
  /** Best-effort link hint from git remote (GitLab path or GitHub owner/repo). */
  remoteHint?: string
}

export type HiveProjectSummary = {
  id: string
  name: string
  pathWithNamespace?: string | null
}

export type HiveEnvironmentSummary = {
  id: string
  name: string
  branch?: string | null
  port?: number | null
  containerPort?: number | null
  domains?: string[]
  status?: string | null
  commitStatus?: string | null
  deployCommit?: string | null
  latestCommit?: string | null
  serverHostname?: string | null
  serverIp?: string | null
  serverId?: string | null
  image?: string | null
  dockerfile?: string | null
  buildContext?: string | null
  updatedAt?: string | null
}

export type HiveEnvFile = {
  path: string
  content: string
  gitlabSnippetId?: string | null
  gitlabSnippetWebUrl?: string | null
}

export type HiveStreamLogLine = {
  id?: string
  parentId?: string | null
  task?: string | null
  msg?: string | null
  level?: string | null
  outcome?: string | null
  runId?: string | null
  url?: string | null
  commitSha?: string | null
  branch?: string | null
  env?: string | null
  createdAt?: string | null
  parentStatus?: string | null
  raw?: Record<string, unknown>
}

export type HiveBuildSummary = {
  id: string
  runId?: string | null
  task?: string | null
  msg?: string | null
  status?: string | null
  createdAt?: string | null
}

export type HiveAddCredentialArgs = {
  label: string
  baseUrl: string
  token: string
}

export type HiveUpdateCredentialArgs = {
  id: string
  label?: string
  baseUrl?: string
  token?: string
}

export type HiveListProjectsArgs = {
  credentialId: string
}

export type HiveListEnvironmentsArgs = {
  credentialId: string
  projectId: string
}

export type HiveLatestBuildArgs = {
  credentialId: string
  projectId: string
}

export type HiveTriggerBuildArgs = {
  credentialId: string
  projectId: string
}

export type HiveTriggerDeployArgs = {
  credentialId: string
  projectId: string
  env?: string
}

export type HiveDispatchArgs = {
  credentialId: string
  projectId: string
  tipe?: 'build' | 'deploy'
  branch?: string
  commit?: string
  workflow?: string
}

export type HiveGetEnvFilesArgs = {
  credentialId: string
  projectId: string
  envId: string
}

export type HiveSaveEnvFilesArgs = {
  credentialId: string
  projectId: string
  envId: string
  files: { path: string; content: string }[]
}

export type HiveStreamHistoryArgs = {
  credentialId: string
  projectId: string
  env?: string
  limit?: number
}

export type HiveDeployEnvironmentArgs = {
  credentialId: string
  projectId: string
  envId: string
  async?: boolean
}

export type HiveApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number }
