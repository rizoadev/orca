/**
 * Multi-tenant Hive API credentials (tokens encrypted at rest).
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import type { HiveCredentialPublic } from '../../shared/hive-types'

type StoredCredential = {
  id: string
  label: string
  baseUrl: string
  tokenPrefix: string
  /** safeStorage ciphertext as base64, or plaintext fallback when encryption unavailable. */
  tokenCipher: string
  encrypted: boolean
  tenantName?: string
  createdAt: number
  lastUsedAt?: number
  status: 'active' | 'invalid'
}

type StoreFile = {
  version: 1
  credentials: StoredCredential[]
}

function storePath(): string {
  const dir = join(app.getPath('userData'), 'hive')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'credentials.json')
}

function readStore(): StoreFile {
  const path = storePath()
  if (!existsSync(path)) {
    return { version: 1, credentials: [] }
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoreFile
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.credentials)) {
      return { version: 1, credentials: [] }
    }
    return parsed
  } catch {
    return { version: 1, credentials: [] }
  }
}

function writeStore(store: StoreFile): void {
  writeFileSync(storePath(), JSON.stringify(store, null, 2), 'utf8')
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

function tokenPrefixOf(token: string): string {
  const t = token.trim()
  return t.length <= 12 ? t : t.slice(0, 12)
}

function encryptToken(token: string): { tokenCipher: string; encrypted: boolean } {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      tokenCipher: safeStorage.encryptString(token).toString('base64'),
      encrypted: true
    }
  }
  return { tokenCipher: Buffer.from(token, 'utf8').toString('base64'), encrypted: false }
}

function decryptToken(entry: StoredCredential): string | null {
  try {
    const raw = Buffer.from(entry.tokenCipher, 'base64')
    if (entry.encrypted && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(raw)
    }
    return raw.toString('utf8')
  } catch {
    return null
  }
}

function toPublic(entry: StoredCredential): HiveCredentialPublic {
  return {
    id: entry.id,
    label: entry.label,
    baseUrl: entry.baseUrl,
    tokenPrefix: entry.tokenPrefix,
    ...(entry.tenantName ? { tenantName: entry.tenantName } : {}),
    createdAt: entry.createdAt,
    ...(entry.lastUsedAt ? { lastUsedAt: entry.lastUsedAt } : {}),
    status: entry.status
  }
}

export function listHiveCredentials(): HiveCredentialPublic[] {
  return readStore()
    .credentials.map(toPublic)
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function addHiveCredential(args: {
  label: string
  baseUrl: string
  token: string
}): HiveCredentialPublic {
  const label = args.label.trim()
  const baseUrl = normalizeBaseUrl(args.baseUrl)
  const token = args.token.trim()
  if (!label) {
    throw new Error('Label is required')
  }
  if (!baseUrl) {
    throw new Error('Base URL is required')
  }
  // Why: prefer hive_… API tokens; also allow opaque JWT/session tokens for bootstrap.
  if (token.length < 8) {
    throw new Error('Token is too short')
  }
  const store = readStore()
  const { tokenCipher, encrypted } = encryptToken(token)
  const entry: StoredCredential = {
    id: randomUUID(),
    label,
    baseUrl,
    tokenPrefix: tokenPrefixOf(token),
    tokenCipher,
    encrypted,
    createdAt: Date.now(),
    status: 'active'
  }
  store.credentials.push(entry)
  writeStore(store)
  return toPublic(entry)
}

export function updateHiveCredential(args: {
  id: string
  label?: string
  baseUrl?: string
  token?: string
}): HiveCredentialPublic {
  const store = readStore()
  const idx = store.credentials.findIndex((c) => c.id === args.id)
  if (idx < 0) {
    throw new Error('Credential not found')
  }
  const current = store.credentials[idx]!
  if (args.label !== undefined) {
    const label = args.label.trim()
    if (!label) {
      throw new Error('Label is required')
    }
    current.label = label
  }
  if (args.baseUrl !== undefined) {
    const baseUrl = normalizeBaseUrl(args.baseUrl)
    if (!baseUrl) {
      throw new Error('Base URL is required')
    }
    current.baseUrl = baseUrl
  }
  if (args.token !== undefined) {
    const token = args.token.trim()
    if (!token) {
      throw new Error('Token is required')
    }
    const enc = encryptToken(token)
    current.tokenCipher = enc.tokenCipher
    current.encrypted = enc.encrypted
    current.tokenPrefix = tokenPrefixOf(token)
    current.status = 'active'
  }
  store.credentials[idx] = current
  writeStore(store)
  return toPublic(current)
}

export function removeHiveCredential(id: string): void {
  const store = readStore()
  store.credentials = store.credentials.filter((c) => c.id !== id)
  writeStore(store)
}

export function resolveHiveAuth(
  credentialId: string
): { baseUrl: string; token: string; public: HiveCredentialPublic } | null {
  const store = readStore()
  const entry = store.credentials.find((c) => c.id === credentialId)
  if (!entry) {
    return null
  }
  const token = decryptToken(entry)
  if (!token) {
    entry.status = 'invalid'
    writeStore(store)
    return null
  }
  entry.lastUsedAt = Date.now()
  writeStore(store)
  return { baseUrl: entry.baseUrl, token, public: toPublic(entry) }
}

export function markHiveCredentialInvalid(credentialId: string): void {
  const store = readStore()
  const entry = store.credentials.find((c) => c.id === credentialId)
  if (!entry) {
    return
  }
  entry.status = 'invalid'
  writeStore(store)
}

export function setHiveCredentialTenantName(credentialId: string, tenantName: string): void {
  const store = readStore()
  const entry = store.credentials.find((c) => c.id === credentialId)
  if (!entry) {
    return
  }
  entry.tenantName = tenantName
  writeStore(store)
}
