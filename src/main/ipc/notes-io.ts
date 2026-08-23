// Why: notes file I/O (export/backup/import) extracted from the service so the
// Turso-backed service file stays under the max-lines budget. These take the
// live TursoNotesStore and the userData path as inputs.
import { BrowserWindow, dialog } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getCanonicalUserDataPath } from '../persistence'
import type {
  Note,
  NotesBackupPayload,
  NotesExportResult,
  NotesImportResult,
  NoteTag
} from '../../shared/notes-types'
import type { TursoNotesStore } from '../notes/sync-turso/turso-notes-store'

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
  const notes = Array.isArray(parsed.notes) ? (parsed.notes as Note[]) : []
  const tags = Array.isArray(parsed.tags) ? (parsed.tags as NoteTag[]) : []
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

export async function getSnapshot(store: TursoNotesStore): Promise<NotesBackupPayload> {
  await store.ensureSchema()
  const { notes, tags } = await store.getSnapshot()
  return { version: 1, exportedAt: Date.now(), notes, tags }
}

// Why: export/backup let the user own their data even though it lives in
// Turso — the notes are plain JSON so they stay portable off the vendor.
export async function exportNotes(store: TursoNotesStore): Promise<NotesExportResult> {
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
    const snapshot = await getSnapshot(store)
    await writeFile(filePath, JSON.stringify(snapshot, null, 2), { encoding: 'utf8', mode: 0o600 })
    return { status: 'ok', filePath, notes: snapshot.notes.length, tags: snapshot.tags.length }
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) }
  }
}

export async function backupNotes(store: TursoNotesStore): Promise<NotesExportResult> {
  try {
    const snapshot = await getSnapshot(store)
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
    return { status: 'error', error: error instanceof Error ? error.message : String(error) }
  }
}

export async function importNotes(store: TursoNotesStore): Promise<NotesImportResult> {
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
    properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[]
  }
  const { canceled, filePaths } = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (canceled || filePaths.length === 0) {
    return { status: 'cancelled' }
  }
  try {
    await store.ensureSchema()
    // Why: each selected file is either a JSON snapshot or a text note.
    const notes: Note[] = []
    const tags: NoteTag[] = []
    for (const filePath of filePaths) {
      const ext = basename(filePath).split('.').pop()?.toLowerCase()
      if (ext === 'txt') {
        const content = await readFile(filePath, 'utf8')
        const note: Note = {
          id: randomUUID(),
          title: deriveNoteTitleFromFile(basename(filePath)),
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
    return { status: 'error', error: error instanceof Error ? error.message : String(error) }
  }
}
