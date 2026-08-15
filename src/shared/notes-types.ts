/** Notes stored directly in Turso (no local JSON vault). */

export type NoteTag = {
  id: string
  name: string
  color: string | null
  createdAt: number
  updatedAt: number
}

export type Note = {
  id: string
  /** Display title; derived from the first heading/line of content when empty. */
  title: string
  /** Raw Markdown body. */
  content: string
  /** Tag ids (ordered). */
  tagIds: string[]
  /** Whether the note has been pinned to the top of list views. */
  pinned: boolean
  /** Monotonic timestamp so list sorting can break ties deterministically. */
  createdAt: number
  updatedAt: number
}

export type NoteCreateInput = {
  title?: string
  content?: string
  tagIds?: string[]
}

export type NoteUpdateInput = {
  title?: string
  content?: string
  tagIds?: string[]
  pinned?: boolean
}

export type NoteTagCreateInput = {
  name: string
  color?: string | null
}

export type NoteTagUpdateInput = {
  name?: string
  color?: string | null
}

export type NotesListResult = {
  notes: Note[]
  tags: NoteTag[]
}

export type NoteSearchQuery = {
  /** Case-insensitive substring match against title + content. */
  text?: string
  /** Only notes carrying at least one of these tag ids. */
  tagIds?: string[]
}

/** A full snapshot of the notes store, used for export, backup and import. */
export type NotesBackupPayload = {
  version: 1
  exportedAt: number
  notes: Note[]
  tags: NoteTag[]
}

export type NotesExportResult =
  | { status: 'ok'; filePath: string; notes: number; tags: number }
  | { status: 'cancelled' }
  | { status: 'error'; error: string }

export type NotesImportResult =
  | { status: 'cancelled' }
  | { status: 'ok'; source: 'file' | 'backup'; filePath?: string; notesImported: number; tagsImported: number; notesUpdated: number; tagsUpdated: number }
  | { status: 'error'; error: string }
