import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getCanonicalUserDataPath } from '../../persistence'
import {
  defaultNotesSyncUserConfig,
  type NotesSyncConflictResolution,
  type NotesSyncProviderId,
  type NotesSyncUserConfig
} from '../../../shared/notes-sync-types'

// Why: sync user config (provider, Turso URL/token, interval) lives in userData
// separately from the notes store so it can be read before the store exists.

type PersistedSyncConfig = {
  version: number
  provider: NotesSyncProviderId | null
  tursoDbUrl: string
  tursoAuthToken: string
  syncIntervalMinutes: number
  conflictResolution: NotesSyncConflictResolution
}

function getPath(): string {
  return join(getCanonicalUserDataPath(), 'notes-sync-config.json')
}

function toPersisted(config: NotesSyncUserConfig): PersistedSyncConfig {
  return {
    version: 1,
    provider: config.provider,
    tursoDbUrl: config.tursoDbUrl,
    tursoAuthToken: config.tursoAuthToken,
    syncIntervalMinutes: config.syncIntervalMinutes,
    conflictResolution: config.conflictResolution
  }
}

function load(): PersistedSyncConfig {
  try {
    const raw = JSON.parse(readFileSync(getPath(), 'utf8')) as Partial<PersistedSyncConfig>
    const defaults = defaultNotesSyncUserConfig()
    return {
      version: 1,
      provider: raw.provider === 'turso' ? 'turso' : (defaults.provider ?? null),
      tursoDbUrl: typeof raw.tursoDbUrl === 'string' ? raw.tursoDbUrl : '',
      tursoAuthToken: typeof raw.tursoAuthToken === 'string' ? raw.tursoAuthToken : '',
      syncIntervalMinutes:
        typeof raw.syncIntervalMinutes === 'number' &&
        Number.isFinite(raw.syncIntervalMinutes) &&
        raw.syncIntervalMinutes >= 0
          ? Math.round(raw.syncIntervalMinutes)
          : defaults.syncIntervalMinutes,
      conflictResolution:
        raw.conflictResolution === 'remote-wins' || raw.conflictResolution === 'local-wins'
          ? raw.conflictResolution
          : defaults.conflictResolution
    }
  } catch {
    return toPersisted(defaultNotesSyncUserConfig())
  }
}

let cached = load()

export function notesSyncUserConfig(): NotesSyncUserConfig {
  return {
    provider: cached.provider,
    tursoDbUrl: cached.tursoDbUrl,
    tursoAuthToken: cached.tursoAuthToken,
    syncIntervalMinutes: cached.syncIntervalMinutes,
    conflictResolution: cached.conflictResolution
  }
}

export function setNotesSyncUserConfig(updates: Partial<NotesSyncUserConfig>): NotesSyncUserConfig {
  cached = {
    ...cached,
    provider: updates.provider !== undefined ? updates.provider : cached.provider,
    tursoDbUrl: updates.tursoDbUrl !== undefined ? updates.tursoDbUrl : cached.tursoDbUrl,
    tursoAuthToken:
      updates.tursoAuthToken !== undefined ? updates.tursoAuthToken : cached.tursoAuthToken,
    syncIntervalMinutes:
      updates.syncIntervalMinutes !== undefined
        ? Math.max(0, Math.round(updates.syncIntervalMinutes))
        : cached.syncIntervalMinutes,
    conflictResolution:
      updates.conflictResolution !== undefined
        ? updates.conflictResolution
        : cached.conflictResolution
  }
  const dir = getCanonicalUserDataPath()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(getPath(), JSON.stringify(toPersisted(cached), null, 2), {
    encoding: 'utf8',
    mode: 0o600
  })
  return notesSyncUserConfig()
}

export function isTursoConfigured(): boolean {
  return cached.provider === 'turso' && cached.tursoDbUrl.trim() !== '' && cached.tursoAuthToken.trim() !== ''
}
