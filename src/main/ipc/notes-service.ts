// Why: extracted from notes.ts so the IPC register file stays thin and under
// the max-lines budget. Owns the TursoClient + store (hot storage) so the
// renderer's window.api.notes.* surface is unchanged.
import { webContents } from 'electron'
import { EventEmitter } from 'node:events'
import type {
  NoteCreateInput,
  NoteSearchQuery,
  NoteTagCreateInput,
  NoteTagUpdateInput,
  NoteUpdateInput
} from '../../shared/notes-types'
import type {
  NotesSyncRunResult,
  NotesSyncRunStatus,
  NotesSyncStatus,
  NotesSyncUserConfig
} from '../../shared/notes-sync-types'
import { TursoClient } from '../notes/sync-turso/turso-client'
import { TursoNotesStore } from '../notes/sync-turso/turso-notes-store'
import { isTursoConfigured, notesSyncUserConfig } from '../notes/sync-turso/sync-config'
import { backupNotes, exportNotes, importNotes } from './notes-io'

class TursoNotesService extends EventEmitter {
  private client: TursoClient | null = null
  private store: TursoNotesStore | null = null
  private revision = 0
  // Why: Turso is hot storage, so "sync" is a server re-read + renderer refresh.
  // A timer drives automatic pulls at the user-configured interval.
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private lastRun: NotesSyncStatus['lastRun'] = null
  private clientKey: string = ''

  private clientKeyFor(config: NotesSyncUserConfig): string {
    return `${config.tursoDbUrl}::${config.tursoAuthToken}`
  }

  private getStore(): TursoNotesStore {
    const config = notesSyncUserConfig()
    if (config.provider !== 'turso' || !isTursoConfigured()) {
      throw new Error('Turso is not connected. Configure it in Settings → Integrations → Notes.')
    }
    if (!this.client || !this.store || this.clientKey !== this.clientKeyFor(config)) {
      this.clientKey = this.clientKeyFor(config)
      this.client = new TursoClient(config.tursoDbUrl, config.tursoAuthToken)
      this.store = new TursoNotesStore(this.client)
    }
    return this.store
  }

  /** Rebuild client/store so a config change takes effect immediately. */
  resetConfig(): void {
    this.client = null
    this.store = null
    this.bump()
    this.emitChange()
    this.restartPoll()
  }

  private bump(): void {
    this.revision += 1
  }

  getStatus(): NotesSyncStatus {
    return {
      connection: isTursoConfigured()
        ? { state: 'connected', database: notesSyncUserConfig().tursoDbUrl }
        : { state: 'disconnected' },
      lastRun: this.lastRun,
      revision: this.revision
    }
  }

  async ensureSchema(): Promise<void> {
    await this.getStore().ensureSchema()
  }

  // Why: a sync run is a server re-read. Turso is hot storage, so the local
  // "pull" is a fresh list() that the caller (renderer) uses to refresh; any
  // rows written on another device appear because the read goes to the server.
  async syncNow(): Promise<NotesSyncRunResult> {
    if (!isTursoConfigured()) {
      this.recordRun('error', 'Turso is not connected')
      return { status: 'error', error: 'Turso is not connected.' }
    }
    await this.getStore().ensureSchema()
    try {
      await this.getStore().list()
      const pulled = this.lastRun?.pulled ?? 0
      this.recordRun('idle', undefined, { pulled, pushed: 0, deleted: 0 })
      this.emitChange()
      this.emitDataChanged()
      return { status: 'ok', pulled, pushed: 0, deleted: 0 }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.recordRun('error', message)
      return { status: 'error', error: message }
    }
  }

  private recordRun(
    runStatus: NotesSyncRunStatus,
    error?: string,
    counts?: { pulled: number; pushed: number; deleted: number }
  ): void {
    this.lastRun = {
      status: runStatus,
      finishedAt: Date.now(),
      pulled: counts?.pulled ?? 0,
      pushed: counts?.pushed ?? 0,
      deleted: counts?.deleted ?? 0,
      error
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    const config = notesSyncUserConfig()
    if (!isTursoConfigured()) {
      return { ok: false, error: 'Turso URL and token are not configured.' }
    }
    try {
      const client = new TursoClient(config.tursoDbUrl, config.tursoAuthToken)
      await client.execute('SELECT 1')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  // Forward methods to the live store after ensuring schema.
  async list(query?: NoteSearchQuery) {
    const store = this.getStore()
    await store.ensureSchema()
    return store.list(query)
  }

  async get(id: string) {
    const store = this.getStore()
    await store.ensureSchema()
    return store.getNote(id)
  }

  async createNote(input?: NoteCreateInput) {
    const store = this.getStore()
    await store.ensureSchema()
    const result = await store.createNote(input ?? {})
    this.afterLocalWrite(1)
    return result
  }

  async updateNote(id: string, input?: NoteUpdateInput) {
    const store = this.getStore()
    await store.ensureSchema()
    const result = await store.updateNote(id, input ?? {})
    this.afterLocalWrite(1)
    return result
  }

  async deleteNote(id: string) {
    const store = this.getStore()
    await store.ensureSchema()
    const result = await store.deleteNote(id)
    this.afterLocalWrite(1)
    return result
  }

  async createTag(input?: NoteTagCreateInput) {
    const store = this.getStore()
    await store.ensureSchema()
    const result = await store.createTag(input ?? { name: '' })
    this.afterLocalWrite(1)
    return result
  }

  async updateTag(id: string, input?: NoteTagUpdateInput) {
    const store = this.getStore()
    await store.ensureSchema()
    const result = await store.updateTag(id, input ?? {})
    this.afterLocalWrite(1)
    return result
  }

  async deleteTag(id: string) {
    const store = this.getStore()
    await store.ensureSchema()
    const result = await store.deleteTag(id)
    this.afterLocalWrite(1)
    return result
  }

  async exportNotes(): Promise<ReturnType<typeof exportNotes>> {
    return exportNotes(this.getStore())
  }

  async backupNotes(): Promise<ReturnType<typeof backupNotes>> {
    return backupNotes(this.getStore())
  }

  async importNotes(): Promise<ReturnType<typeof importNotes>> {
    return importNotes(this.getStore())
  }

  private emitChange(): void {
    this.emit('status-changed', this.getStatus())
  }

  // Why: notify the renderer that server data may have changed (local write or
  // a completed pull) so it re-reads the note list from Turso.
  private emitDataChanged(): void {
    for (const window of webContents.getAllWebContents()) {
      window.send('notes:dataChanged')
    }
  }

  private afterLocalWrite(pushed: number): void {
    this.recordRun('idle', undefined, {
      pulled: this.lastRun?.pulled ?? 0,
      pushed,
      deleted: 0
    })
    this.bump()
    this.emitChange()
    this.emitDataChanged()
  }

  // No-op lifecycle compatibility with the previous manager.
  isConfigured(): boolean {
    return isTursoConfigured()
  }

  // Why: start the automatic pull timer using the configured interval. A 0
  // interval means manual-only (no background timer); the renderer's "Sync now"
  // button still triggers an on-demand pull.
  start(): void {
    this.restartPoll()
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  restartPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    const minutes = notesSyncUserConfig().syncIntervalMinutes
    if (minutes > 0 && isTursoConfigured()) {
      this.pollTimer = setInterval(
        () => {
          void this.syncNow().catch(() => undefined)
        },
        Math.max(1, Math.round(minutes) * 60_000)
      )
    }
  }
}

export { TursoNotesService }
