/* eslint-disable max-lines -- Why: the notes store reads/writes directly to the
 * Turso database (no local file cache). All methods return the same shape the
 * renderer already consumes (NotesListResult), so the UI needs no changes. */
import { randomUUID } from 'node:crypto'
import type {
  Note,
  NoteCreateInput,
  NoteSearchQuery,
  NoteTag,
  NoteTagCreateInput,
  NoteTagUpdateInput,
  NoteUpdateInput,
  NotesListResult
} from '../../../shared/notes-types'
import type { TursoClient } from './turso-client'

// Why: hot storage — every note/tag operation issues SQL against Turso.
// There is intentionally no JSON/file persistence layer.

export class TursoNotesStore {
  private readonly client: TursoClient

  constructor(client: TursoClient) {
    this.client = client
  }

  // ── Schema ──────────────────────────────────────────────────────────
  async ensureSchema(): Promise<void> {
    for (const sql of TursoNotesStore.SCHEMA) {
      await this.client.execute(sql)
    }
  }

  static SCHEMA = [
    `CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS note_tag (
      note_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (note_id, tag_id)
    )`
  ]

  // ── Query helpers ───────────────────────────────────────────────────
  private async fetchTags(): Promise<NoteTag[]> {
    const res = await this.client.execute(
      'SELECT id, name, color, created_at, updated_at FROM tags ORDER BY name COLLATE NOCASE'
    )
    return res.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      color: row.color === null || row.color === undefined ? null : String(row.color),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }))
  }

  private async fetchNoteTagMap(): Promise<Map<string, string[]>> {
    const res = await this.client.execute('SELECT note_id, tag_id FROM note_tag')
    const map = new Map<string, string[]>()
    for (const row of res.rows) {
      const noteId = String(row.note_id)
      const list = map.get(noteId) ?? []
      list.push(String(row.tag_id))
      map.set(noteId, list)
    }
    return map
  }

  private async fetchNoteById(id: string): Promise<Note | null> {
    const res = await this.client.execute(
      'SELECT id, title, content, pinned, created_at, updated_at FROM notes WHERE id = ?',
      [id]
    )
    const row = res.rows[0]
    if (!row) {
      return null
    }
    const tagMap = await this.fetchNoteTagMap()
    return {
      id: String(row.id),
      title: String(row.title ?? ''),
      content: String(row.content ?? ''),
      tagIds: tagMap.get(id) ?? [],
      pinned: Boolean(row.pinned),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }
  }

  private rowToNote(row: Record<string, string | number | null>, tagIds: string[]): Note {
    return {
      id: String(row.id),
      title: String(row.title ?? ''),
      content: String(row.content ?? ''),
      tagIds,
      pinned: Boolean(row.pinned),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }
  }

  // ── Notes API ───────────────────────────────────────────────────────
  async list(query?: NoteSearchQuery): Promise<NotesListResult> {
    const notes = await this.queryNotes(query)
    const tags = await this.fetchTags()
    return { notes, tags }
  }

  private async queryNotes(query?: NoteSearchQuery): Promise<Note[]> {
    const tagMap = await this.fetchNoteTagMap()
    const tagFilter = query?.tagIds?.filter((id) => typeof id === 'string' && id)
    const text = query?.text?.trim().toLowerCase()

    let sql = 'SELECT id, title, content, pinned, created_at, updated_at FROM notes'
    const conditions: string[] = []
    const args: (string | number | null)[] = []

    // Why: when filtering by a tag, only include notes that carry it.
    if (tagFilter && tagFilter.length > 0) {
      const placeholders = tagFilter.map(() => '?').join(', ')
      conditions.push(
        `id IN (SELECT note_id FROM note_tag WHERE tag_id IN (${placeholders}))`
      )
      args.push(...tagFilter)
    }
    if (text) {
      conditions.push('(lower(title) LIKE ? OR lower(content) LIKE ?)')
      args.push(`%${text}%`, `%${text}%`)
    }
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }
    // Why: pinned first, then most recently updated.
    sql += ' ORDER BY pinned DESC, updated_at DESC, created_at DESC'

    const res = await this.client.execute(sql, args)
    return res.rows.map((row) => this.rowToNote(row, tagMap.get(String(row.id)) ?? []))
  }

  async getNote(id: string): Promise<Note | null> {
    return this.fetchNoteById(id)
  }

  async createNote(input: NoteCreateInput): Promise<NotesListResult> {
    const now = Date.now()
    const id = randomUUID()
    const title = (input.title ?? '').trim() || 'Untitled note'
    await this.client.execute(
      `INSERT INTO notes (id, title, content, pinned, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
      [id, title, input.content ?? '', now, now]
    )
    await this.replaceNoteTags(id, input.tagIds ?? [])
    return this.list()
  }

  async updateNote(id: string, input: NoteUpdateInput): Promise<NotesListResult> {
    const batches: { sql: string; args: (string | number | null)[] }[] = []
    if (input.title !== undefined || input.content !== undefined || input.pinned !== undefined) {
      const sets: string[] = []
      const args: (string | number | null)[] = []
      if (input.title !== undefined) {
        sets.push('title = ?')
        args.push((input.title ?? '').trim() || 'Untitled note')
      }
      if (input.content !== undefined) {
        sets.push('content = ?')
        args.push(input.content ?? '')
      }
      if (input.pinned !== undefined) {
        sets.push('pinned = ?')
        args.push(input.pinned ? 1 : 0)
      }
      sets.push('updated_at = ?')
      args.push(Date.now())
      args.unshift(id)
      batches.push({ sql: `UPDATE notes SET ${sets.join(', ')} WHERE id = ?`, args })
    }
    if (input.tagIds !== undefined) {
      batches.push({ sql: 'DELETE FROM note_tag WHERE note_id = ?', args: [id] })
      for (const tagId of input.tagIds) {
        batches.push({
          sql: 'INSERT OR IGNORE INTO note_tag (note_id, tag_id) VALUES (?, ?)',
          args: [id, tagId]
        })
      }
    }
    if (batches.length > 0) {
      await this.client.pipelineBatch(batches)
    }
    return this.list()
  }

  async deleteNote(id: string): Promise<NotesListResult> {
    await this.client.pipelineBatch([
      { sql: 'DELETE FROM note_tag WHERE note_id = ?', args: [id] },
      { sql: 'DELETE FROM notes WHERE id = ?', args: [id] }
    ])
    return this.list()
  }

  // ── Tags API ────────────────────────────────────────────────────────
  async createTag(input: NoteTagCreateInput): Promise<NotesListResult> {
    const name = input.name.trim()
    if (!name) {
      return this.list()
    }
    const exists = await this.client.execute(
      'SELECT id FROM tags WHERE lower(name) = lower(?)',
      [name]
    )
    if (exists.rows.length > 0) {
      return this.list()
    }
    const now = Date.now()
    await this.client.execute(
      `INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), name, input.color?.trim() || null, now, now]
    )
    return this.list()
  }

  async updateTag(id: string, input: NoteTagUpdateInput): Promise<NotesListResult> {
    const sets: string[] = []
    const args: (string | number | null)[] = []
    if (input.name !== undefined) {
      sets.push('name = ?')
      args.push(input.name.trim())
    }
    if (input.color !== undefined) {
      sets.push('color = ?')
      args.push(input.color?.trim() || null)
    }
    if (sets.length > 0) {
      sets.push('updated_at = ?')
      args.push(Date.now())
      args.push(id)
      await this.client.execute(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`, args)
    }
    return this.list()
  }

  async deleteTag(id: string): Promise<NotesListResult> {
    await this.client.pipelineBatch([
      { sql: 'DELETE FROM note_tag WHERE tag_id = ?', args: [id] },
      { sql: 'DELETE FROM tags WHERE id = ?', args: [id] }
    ])
    return this.list()
  }

  // ── Export / import ──────────────────────────────────────────────────
  async getSnapshot(): Promise<{ notes: Note[]; tags: NoteTag[] }> {
    const notes = await this.getAllNotes()
    const tags = await this.fetchTags()
    return { notes, tags }
  }

  // Why: import is upsert-on-id so an existing note keeps its id while its
  // content/pins/tags are refreshed; new records keep their original ids so
  // cross-note references (tags) stay intact across a restore.
  async importSnapshot(snapshot: { notes: Note[]; tags: NoteTag[] }): Promise<{
    notesImported: number
    tagsImported: number
    notesUpdated: number
    tagsUpdated: number
  }> {
    const existingNoteIds = new Set((await this.getAllNotes()).map((n) => n.id))
    const existingTagIds = new Set((await this.fetchTags()).map((t) => t.id))
    let notesImported = 0
    let notesUpdated = 0
    let tagsImported = 0
    let tagsUpdated = 0

    const batches: { sql: string; args: (string | number | null)[] }[] = []
    for (const note of snapshot.notes) {
      const existed = existingNoteIds.has(note.id)
      if (existed) {
        notesUpdated += 1
      } else {
        existingNoteIds.add(note.id)
        notesImported += 1
      }
      batches.push({
        sql: `INSERT INTO notes (id, title, content, pinned, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                title=excluded.title, content=excluded.content, pinned=excluded.pinned,
                created_at=excluded.created_at, updated_at=excluded.updated_at`,
        args: [note.id, note.title, note.content, note.pinned ? 1 : 0, note.createdAt, note.updatedAt]
      })
      batches.push({ sql: 'DELETE FROM note_tag WHERE note_id = ?', args: [note.id] })
      for (const tagId of note.tagIds) {
        batches.push({
          sql: 'INSERT OR IGNORE INTO note_tag (note_id, tag_id) VALUES (?, ?)',
          args: [note.id, tagId]
        })
      }
    }
    for (const tag of snapshot.tags) {
      const existed = existingTagIds.has(tag.id)
      if (existed) {
        tagsUpdated += 1
      } else {
        existingTagIds.add(tag.id)
        tagsImported += 1
      }
      batches.push({
        sql: `INSERT INTO tags (id, name, color, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                name=excluded.name, color=excluded.color,
                created_at=excluded.created_at, updated_at=excluded.updated_at`,
        args: [tag.id, tag.name, tag.color, tag.createdAt, tag.updatedAt]
      })
    }
    await this.client.pipelineBatch(batches)
    return { notesImported, tagsImported, notesUpdated, tagsUpdated }
  }

  // ── Used by the editor / tests ──────────────────────────────────────
  async getAllNotes(): Promise<Note[]> {
    return this.queryNotes(undefined)
  }

  async findRemoteNewerNotes(remote: Note[]): Promise<{ note: Note; local: Note | null }[]> {
    const localById = new Map((await this.getAllNotes()).map((n) => [n.id, n]))
    const out: { note: Note; local: Note | null }[] = []
    for (const candidate of remote) {
      const local = localById.get(candidate.id)
      if (!local || candidate.updatedAt > local.updatedAt) {
        out.push({ note: candidate, local: local ?? null })
      }
    }
    return out
  }

  async applyRemoteNotes(remote: Note[]): Promise<string[]> {
    const applied: string[] = []
    const batches: { sql: string; args: (string | number | null)[] }[] = []
    for (const note of remote) {
      const local = await this.fetchNoteById(note.id)
      // Why: never downgrade a newer local version.
      if (local && note.updatedAt <= local.updatedAt) {
        continue
      }
      batches.push({
        sql: `INSERT INTO notes (id, title, content, pinned, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                title=excluded.title, content=excluded.content, pinned=excluded.pinned,
                created_at=excluded.created_at, updated_at=excluded.updated_at`,
        args: [note.id, note.title, note.content, note.pinned ? 1 : 0, note.createdAt, note.updatedAt]
      })
      batches.push({ sql: 'DELETE FROM note_tag WHERE note_id = ?', args: [note.id] })
      for (const tagId of note.tagIds) {
        batches.push({
          sql: 'INSERT OR IGNORE INTO note_tag (note_id, tag_id) VALUES (?, ?)',
          args: [note.id, tagId]
        })
      }
      applied.push(note.id)
    }
    if (batches.length > 0) {
      await this.client.pipelineBatch(batches)
    }
    return applied
  }

  async applyRemoteDeletion(id: string, remoteDeletedAt: number): Promise<boolean> {
    const local = await this.fetchNoteById(id)
    if (local && local.updatedAt > remoteDeletedAt) {
      return false
    }
    await this.client.pipelineBatch([
      { sql: 'DELETE FROM note_tag WHERE note_id = ?', args: [id] },
      { sql: 'DELETE FROM notes WHERE id = ?', args: [id] }
    ])
    return true
  }

  private async replaceNoteTags(noteId: string, tagIds: string[]): Promise<void> {
    const batches: { sql: string; args: (string | number | null)[] }[] = [
      { sql: 'DELETE FROM note_tag WHERE note_id = ?', args: [noteId] }
    ]
    for (const tagId of tagIds) {
      batches.push({
        sql: 'INSERT OR IGNORE INTO note_tag (note_id, tag_id) VALUES (?, ?)',
        args: [noteId, tagId]
      })
    }
    await this.client.pipelineBatch(batches)
  }
}