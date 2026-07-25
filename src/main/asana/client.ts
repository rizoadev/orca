/**
 * Asana Personal Access Token auth + credential storage.
 * Token stored encrypted under ~/.orca/asana-token.enc (same pattern as Jira).
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { net, safeStorage } from 'electron'
import {
  credentialFileHasContent,
  readIntegrationCredentialFileSync,
  readStoredCredentialToken
} from '../integration-credential-file'
import { ensureElectronProxyFromEnvironment } from '../network/proxy-settings'
import { readFetchResponseJsonWithinLimit } from '../lib/fetch-response-body'
import { boundedIntegrationErrorMessage } from '../integration-error-message'
import type {
  AsanaConnectArgs,
  AsanaConnectionStatus,
  AsanaViewer,
  AsanaWorkspace
} from '../../shared/asana-types'

const ASANA_API = 'https://app.asana.com/api/1.0'
const ASANA_USER_AGENT = 'Orca'
const MAX_TOKEN_BYTES = 8_192

export class AsanaApiError extends Error {
  status: number | null
  constructor(message: string, status: number | null = null) {
    super(boundedIntegrationErrorMessage(message))
    this.status = status
  }
}

let cachedToken: string | null = null
let credentialError: string | null = null
let cachedViewer: AsanaViewer | null = null
let cachedWorkspaces: AsanaWorkspace[] = []
let activeWorkspaceGid: string | null = null

function getOrcaDir(): string {
  return join(homedir(), '.orca')
}

function getTokenPath(): string {
  return join(getOrcaDir(), 'asana-token.enc')
}

function getStatePath(): string {
  return join(getOrcaDir(), 'asana-state.json')
}

function ensureOrcaDir(): void {
  const dir = getOrcaDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function hasStoredToken(): boolean {
  return cachedToken !== null || credentialFileHasContent(getTokenPath())
}

function loadToken(): string | null {
  if (cachedToken) {
    return cachedToken
  }
  try {
    const path = getTokenPath()
    if (!existsSync(path)) {
      return null
    }
    const raw = readIntegrationCredentialFileSync(path)
    const token = readStoredCredentialToken('Asana', raw)
    if (token) {
      cachedToken = token
      credentialError = null
      return token
    }
  } catch (err) {
    credentialError = err instanceof Error ? err.message : String(err)
  }
  return null
}

function storeToken(token: string): void {
  ensureOrcaDir()
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token)
    if (encrypted.byteLength > MAX_TOKEN_BYTES) {
      throw new Error(`Asana encrypted credential exceeds ${MAX_TOKEN_BYTES} bytes.`)
    }
    writeFileSync(getTokenPath(), encrypted)
  } else {
    console.warn('[asana] safeStorage encryption unavailable — storing token in plaintext')
    writeFileSync(getTokenPath(), token, 'utf8')
  }
  cachedToken = token
  credentialError = null
}

function clearToken(): void {
  cachedToken = null
  cachedViewer = null
  cachedWorkspaces = []
  activeWorkspaceGid = null
  credentialError = null
  try {
    if (existsSync(getTokenPath())) {
      unlinkSync(getTokenPath())
    }
  } catch {
    // ignore
  }
  try {
    if (existsSync(getStatePath())) {
      unlinkSync(getStatePath())
    }
  } catch {
    // ignore
  }
}

function loadState(): void {
  try {
    if (!existsSync(getStatePath())) {
      return
    }
    const raw = readFileSync(getStatePath(), 'utf8')
    const data = JSON.parse(raw) as { activeWorkspaceGid?: string | null }
    if (typeof data.activeWorkspaceGid === 'string') {
      activeWorkspaceGid = data.activeWorkspaceGid
    }
  } catch {
    // ignore
  }
}

function saveState(): void {
  ensureOrcaDir()
  writeFileSync(
    getStatePath(),
    JSON.stringify({ activeWorkspaceGid }, null, 2),
    'utf8'
  )
}

export async function asanaFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {}
): Promise<T> {
  await ensureElectronProxyFromEnvironment()
  const token = options.token ?? loadToken()
  if (!token) {
    throw new AsanaApiError('Not connected to Asana. Connect with a Personal Access Token first.')
  }
  const url = path.startsWith('http') ? path : `${ASANA_API}${path}`
  const res = await net.fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': ASANA_USER_AGENT
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const errBody = (await res.json()) as { errors?: Array<{ message?: string }> }
      if (errBody.errors?.[0]?.message) {
        detail = errBody.errors[0].message
      }
    } catch {
      // ignore
    }
    throw new AsanaApiError(`Asana API ${res.status}: ${detail}`, res.status)
  }
  return readFetchResponseJsonWithinLimit<T>(res)
}

type AsanaMeResponse = {
  data: {
    gid: string
    name: string
    email?: string
    photo?: { image_128x128?: string }
    workspaces?: Array<{ gid: string; name: string }>
  }
}

export async function testConnection(token: string): Promise<{
  viewer: AsanaViewer
  workspaces: AsanaWorkspace[]
}> {
  const result = await asanaFetch<AsanaMeResponse>(
    '/users/me?opt_fields=gid,name,email,photo.image_128x128,workspaces.gid,workspaces.name',
    { token }
  )
  const d = result.data
  const viewer: AsanaViewer = {
    gid: d.gid,
    name: d.name,
    email: d.email ?? null,
    photoUrl: d.photo?.image_128x128
  }
  const workspaces: AsanaWorkspace[] = (d.workspaces ?? []).map((w) => ({
    gid: w.gid,
    name: w.name
  }))
  return { viewer, workspaces }
}

export async function connect(args: AsanaConnectArgs): Promise<AsanaConnectionStatus> {
  const token = args.personalAccessToken?.trim()
  if (!token) {
    throw new AsanaApiError('Personal Access Token is required.')
  }
  const { viewer, workspaces } = await testConnection(token)
  storeToken(token)
  cachedViewer = viewer
  cachedWorkspaces = workspaces
  if (!activeWorkspaceGid || !workspaces.some((w) => w.gid === activeWorkspaceGid)) {
    activeWorkspaceGid = workspaces[0]?.gid ?? null
    saveState()
  }
  return getStatus()
}

export function disconnect(): AsanaConnectionStatus {
  clearToken()
  return getStatus()
}

export function getStatus(): AsanaConnectionStatus {
  loadState()
  const connected = hasStoredToken() && credentialError === null
  return {
    connected,
    viewer: connected ? cachedViewer : null,
    workspaces: connected ? cachedWorkspaces : [],
    activeWorkspaceGid: connected ? activeWorkspaceGid : null,
    ...(credentialError ? { credentialError } : {})
  }
}

/** Ensure viewer/workspaces are loaded if we have a token but no cache. */
export async function ensureHydrated(): Promise<AsanaConnectionStatus> {
  loadState()
  if (!hasStoredToken()) {
    return getStatus()
  }
  if (cachedViewer && cachedWorkspaces.length > 0) {
    return getStatus()
  }
  try {
    const token = loadToken()
    if (!token) {
      return getStatus()
    }
    const { viewer, workspaces } = await testConnection(token)
    cachedViewer = viewer
    cachedWorkspaces = workspaces
    if (!activeWorkspaceGid || !workspaces.some((w) => w.gid === activeWorkspaceGid)) {
      activeWorkspaceGid = workspaces[0]?.gid ?? null
      saveState()
    }
    credentialError = null
  } catch (err) {
    credentialError = err instanceof Error ? err.message : String(err)
  }
  return getStatus()
}

export function selectWorkspace(workspaceGid: string | null): AsanaConnectionStatus {
  activeWorkspaceGid = workspaceGid
  saveState()
  return getStatus()
}

export function getActiveWorkspaceGid(): string | null {
  loadState()
  return activeWorkspaceGid
}

export function getToken(): string | null {
  return loadToken()
}
