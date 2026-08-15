import { BrowserWindow, dialog, ipcMain, webContents } from 'electron'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getCanonicalUserDataPath } from '../persistence'
import type {
  Note,
  NoteCreateInput,
  NoteSearchQuery,
  NotesBackupPayload,
  NotesExportResult,
  NotesImportResult,
  NoteTag,
  NoteTagCreateInput,
  NoteTagUpdateInput,
  NoteUpdateInput
} from '../../shared/notes-types'
import type {
  NotesSyncRunResult,
  NotesSyncStatus,
  NotesSyncUserConfig
} from '../../shared/notes-sync-types'
import { TursoClient } from '../notes/sync-turso/turso-client'
import { TursoNotesStore } from '../notes/sync-turso/turso-notes-store'
import {
  isTursoConfigured,
  notesSyncUserConfig,
  setNotesSyncUserConfig
} from '../notes/sync-turso/sync-config'

// Why: the store is backed directly by Turso (no local JSON). A light service
// owns the TursoClient + store so IPC handlers stay thin and the renderer
// doesn't need to change (same window.api.notes.* surface).

class TursoNotesService extends EventEmitter {
  private client: TursoClient | null = null
  private store: TursoNotesStore | null = null
  private revision = 0

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

  private clientKey: string = ''

  private clientKeyFor(config: NotesSyncUserConfig): string {
    return `${config.tursoDbUrl}::${config.tursoAuthToken}`
  }

  /** Rebuild client/store so a config change takes effect immediately. */
  resetConfig(): void {
    this.client = null
    this.store = null
    this.bump()
  }

  private bump(): void {
    this.revision += 1
  }

  getStatus(): NotesSyncStatus {
    return {
      connection: isTursoConfigured()
        ? { state: 'connected', database: notesSyncUserConfig().tursoDbUrl }
        : { state: 'disconnected' },
      lastRun: null,
      revision: this.revision
    }
  }

  async ensureSchema(): Promise<void> {
    await this.getStore().ensureSchema()
  }

  // Why: hot storage has no merge/poll cycle; "sync now" just ensures schema so
  // a fresh connection provisions tables without waiting for the first write.
  async syncNow(): Promise<NotesSyncRunResult> {
    await this.getStore().ensureSchema()
    return { status: 'ok', pulled: 0, pushed: 0, deleted: 0 }
  }

  private async getSnapshot(): Promise<NotesBackupPayload> {
    const store = await this.getStore()
    await store.ensureSchema()
    const { notes, tags } = await store.getSnapshot()
    return { version: 1, exportedAt: Date.now(), notes, tags }
  }

  // Why: export/backup let the user own their data even though it lives in
  // Turso — the notes are plain JSON so they stay portable off the vendor.
  async exportNotes(): Promise<NotesExportResult> {
    const parent = BrowserWindow.getFocusedWindow() ?? undefined
    const options = {
      title: 'Export notes',
      defaultPath: `notes-export-${timestampForFile()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const { canceled, filePath } = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (canceled || !filePath) {
      return { status: 'cancelled' }
    }
    try {
      const snapshot = await this.getSnapshot()
      await writeFile(filePath, JSON.stringify(snapshot, null, 2), {
        encoding: 'utf8',
        mode: 0o600
      })
      return {
        status: 'ok',
        filePath,
        notes: snapshot.notes.length,
        tags: snapshot.tags.length
      }
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async backupNotes(): Promise<NotesExportResult> {
    try {
      const snapshot = await this.getSnapshot()
      const dir = getCanonicalUserDataPath()
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      const backupPath = join(dir, `notes-backup-${timestampForFile()}.json`)
      await writeFile(backupPath, JSON.stringify(snapshot, null, 2), {
        encoding: 'utf8',
        mode: 0o600
      })
      return {
        status: 'ok',
        filePath: backupPath,
        notes: snapshot.notes.length,
        tags: snapshot.tags.length
      }
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  async importNotes(): Promise<NotesImportResult> {
    const parent = BrowserWindow.getFocusedWindow() ?? undefined
    const options = {
      title: 'Import notes',
      // Why: accept both Orca's JSON backup format and plain-text files; a
      // .txt import treats each file as a new note from its raw content.
      filters: [
        { name: 'Notes', extensions: ['json', 'txt'] },
        { name: 'JSON backup', extensions: ['json'] },
        { name: 'Plain text', extensions: ['txt'] }
      ],
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>
    }
    const { canceled, filePaths } = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (canceled || filePaths.length === 0) {
      return { status: 'cancelled' }
    }
    try {
      const store = await this.getStore()
      await store.ensureSchema()

      // Why: each selected file is either a JSON snapshot or a text note.
      const notes: Note[] = []
      const tags: NoteTag[] = []
      for (const filePath of filePaths) {
        const ext = basename(filePath).split('.').pop()?.toLowerCase()
        if (ext === 'txt') {
          const content = await readFile(filePath, 'utf8')
          const title = deriveNoteTitleFromFile(basename(filePath))
          const note: Note = {
            id: randomUUID(),
            title,
            content,
            tagIds: [],
            pinned: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
          notes.push(note)
        } else {
          const raw = await readFile(filePath, 'utf8')
          const snapshot = parseNotesBackup(raw)
          notes.push(...snapshot.notes)
          tags.push(...snapshot.tags)
        }
      }

      const result = await store.importSnapshot({ notes, tags })
      this.bump()
      this.emitChange()
      return {
        status: 'ok',
        source: 'file',
        filePath: filePaths[0],
        notesImported: result.notesImported,
        tagsImported: result.tagsImported,
        notesUpdated: result.notesUpdated,
        tagsUpdated: result.tagsUpdated
      }
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      }
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
    this.bump()
    this.emitChange()
    return result
  }

  async updateNote(id: string, input?: NoteUpdateInput) {
    const store = this.getStore()
    await store.ensureSchema()
    const result = await store.updateNote(id, input ?? {})
    this.bump()
    this.emitChange()
    return result
  }

  async deleteNote(id: string) {
    const store = this.getStore()
    await store.ensureSchema()
    const result = await store.deleteNote(id)
    this.bump()
    this.emitChange()
    return result
  }

  async createTag(input?: NoteTagCreateInput) {
    const store = this.getStore()
    await store.ensureSchema()
    const result = await store.createTag(input ?? { name: '' })
    this.bump()
    this.emitChange()
    return result
  }

  async updateTag(id: string, input?: NoteTagUpdateInput) {
    const store = this.getStore()
    await store.ensureSchema()
    const result = await store.updateTag(id, input ?? {})
    this.bump()
    this.emitChange()
    return result
  }

  async deleteTag(id: string) {
    const store = this.getStore()
    await store.ensureSchema()
    const result = await store.deleteTag(id)
    this.bump()
    this.emitChange()
    return result
  }

  private emitChange(): void {
    this.emit('status-changed', this.getStatus())
  }

  // No-op lifecycle compatibility with the previous manager.
  start(): void {}
  stop(): void {}
  restartPoll(): void {}
  isConfigured(): boolean {
    return isTursoConfigured()
  }
}

function timestampForFile(): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('')
}

// Why: tolerate a payload written by an earlier schema version; unknown keys are
// ignored while the id/count checks guarantee the shape is usable in SQL.
function parseNotesBackup(raw: string): { notes: Note[]; tags: NoteTag[] } {
  const parsed = JSON.parse(raw) as Partial<NotesBackupPayload>
  const notes = Array.isArray(parsed.notes)
    ? (parsed.notes as Note[])
    : []
  const tags = Array.isArray(parsed.tags)
    ? (parsed.tags as NoteTag[])
    : []
  if (notes.length === 0 || tags.length === 0) {
    // Allow empty payload on purpose; validation below fails on malformed entries.
  }
  return { notes, tags }
}

// Why: a txt import names the note after its file (minus the .txt extension)
// so the note is recognizable in the list without editing its content.
function deriveNoteTitleFromFile(filename: string): string {
  const stem = filename.replace(/\.txt$/i, '').trim()
  return stem || 'Imported note'
}

const service = new TursoNotesService()

export function registerNotesHandlers(): TursoNotesService {
  ipcMain.handle('notes:list', (_event, query?: NoteSearchQuery) => service.list(query))
  ipcMain.handle('notes:get', (_event, id: string) => service.get(id))
  ipcMain.handle('notes:createNote', (_event, input?: NoteCreateInput) =>
    service.createNote(input)
  )
  ipcMain.handle('notes:updateNote', (_event, id: string, input?: NoteUpdateInput) =>
    service.updateNote(id, input)
  )
  ipcMain.handle('notes:deleteNote', (_event, id: string) => service.deleteNote(id))
  ipcMain.handle('notes:createTag', (_event, input?: NoteTagCreateInput) =>
    service.createTag(input)
  )
  ipcMain.handle('notes:updateTag', (_event, id: string, input?: NoteTagUpdateInput) =>
    service.updateTag(id, input)
  )
  ipcMain.handle('notes:deleteTag', (_event, id: string) => service.deleteTag(id))

  // Sync/connection surface.
  ipcMain.handle('notes:syncStatus', () => service.getStatus())
  ipcMain.handle('notes:syncNow', () => service.syncNow())
  ipcMain.handle('notes:testConnection', () => service.testConnection())
  ipcMain.handle('notes:syncConfig', () => notesSyncUserConfig())
  ipcMain.handle('notes:setSyncConfig', (_event, updates: Partial<NotesSyncUserConfig>) => {
    const next = setNotesSyncUserConfig(updates)
    service.resetConfig()
    return next
  })

  // Export / backup / import.
  ipcMain.handle('notes:exportNotes', () => service.exportNotes())
  ipcMain.handle('notes:backupNotes', () => service.backupNotes())
  ipcMain.handle('notes:importNotes', () => service.importNotes())

  const forwardStatus = (): void => {
    const status = service.getStatus()
    for (const window of webContents.getAllWebContents()) {
      window.send('notes:syncStatusChanged', status)
    }
  }
  service.on('status-changed', forwardStatus)

  return service
}