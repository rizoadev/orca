/** Turso-backed sync of the notes store. */

export type NotesSyncProviderId = 'turso'

export type NotesSyncConnectionStatus =
  | { state: 'disconnected' }
  | { state: 'connecting' }
  | { state: 'connected'; database: string }
  | { state: 'error'; message: string }

export type NotesSyncRunStatus = 'idle' | 'syncing' | 'paused' | 'error'

export type NotesSyncStatus = {
  connection: NotesSyncConnectionStatus
  /** Most recent sync run outcome; null before the first run. */
  lastRun: {
    status: NotesSyncRunStatus
    finishedAt: number
    pulled: number
    pushed: number
    deleted: number
    error?: string
  } | null
  /** Monotonic per-status read, so the renderer can skip a no-op re-render. */
  revision: number
}

export type NotesSyncConflictResolution = 'remote-wins' | 'local-wins'

export type NotesSyncUserConfig = {
  provider: NotesSyncProviderId | null
  /** Turso database URL, e.g. libsql://<db>-<org>.turso.io */
  tursoDbUrl: string
  /** Turso auth token (scoped to the database). */
  tursoAuthToken: string
  /** Minutes between automatic sync runs; 0 = manual only. */
  syncIntervalMinutes: number
  /** When a row changed on both ends, which version to keep. */
  conflictResolution: NotesSyncConflictResolution
}

export function defaultNotesSyncUserConfig(): NotesSyncUserConfig {
  return {
    provider: null,
    tursoDbUrl: '',
    tursoAuthToken: '',
    syncIntervalMinutes: 5,
    conflictResolution: 'remote-wins'
  }
}

export type NotesSyncRunResult =
  | { status: 'ok'; pulled: number; pushed: number; deleted: number }
  | { status: 'error'; error: string }
