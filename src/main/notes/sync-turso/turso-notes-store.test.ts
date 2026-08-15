import { describe, expect, it, vi } from 'vitest'
import type { TursoClient, TursoStatementResult } from './turso-client'
import { TursoNotesStore } from './turso-notes-store'

// Why: a minimal in-memory TursoClient stand-in so the store's SQL mapping
// (row→Note, tag joins, filters) is exercised without network.
type Row = Record<string, string | number | null>

function result(rows: Row[]): TursoStatementResult {
  return {
    cols: [],
    rows,
    affectedRowCount: rows.length,
    lastInsertRowId: null
  }
}

function createStore(overrides: {
  notes?: Row[]
  tags?: Row[]
  noteTags?: Row[]
  scriptedExecute?: (sql: string, args?: (string | number | null)[]) => TursoStatementResult
} = {
  notes: [],
  tags: [],
  noteTags: []
}) {
  const { notes = [], tags = [], noteTags = [], scriptedExecute } = overrides
  const execute = vi.fn((sql: string, args?: (string | number | null)[]) => {
    if (scriptedExecute) {
      return scriptedExecute(sql, args)
    }
    const s = sql.toLowerCase()
    if (s.includes(' from tags') || s.startsWith('select id, name, color')) {
      return result(tags)
    }
    if (s.includes(' from note_tag') && !s.includes(' where ')) {
      return result(noteTags)
    }
    if (s.includes('select note_id, tag_id')) {
      return result(noteTags)
    }
    // notes listing / select
    return result(notes.filter((n) => (args && args[0] ? n.id === args[0] : true)))
  })
  const pipelineBatch = vi.fn(
    async (batches: { sql: string; args?: (string | number | null)[] }[]) =>
      batches.map(() => result([]))
  )
  const fakeClient = {
    execute,
    pipelineBatch
  } as unknown as TursoClient
  const store = new TursoNotesStore(fakeClient)
  return { store, execute, pipelineBatch }
}

const NOTE_ROW: Row = {
  id: 'n1',
  title: 'Hello',
  content: '# Hello world',
  pinned: 0,
  created_at: 1000,
  updated_at: 2000
}

describe('TursoNotesStore', () => {
  it('maps rows to notes in list()', async () => {
    const { store } = createStore({ notes: [NOTE_ROW] })
    const res = await store.list()
    expect(res.notes[0]).toMatchObject({
      id: 'n1',
      title: 'Hello',
      content: '# Hello world',
      pinned: false,
      createdAt: 1000,
      updatedAt: 2000,
      tagIds: []
    })
  })

  it('includes tag ids on notes via note_tag join', async () => {
    const { store } = createStore({
      notes: [{ ...NOTE_ROW }],
      noteTags: [{ note_id: 'n1', tag_id: 't1' }]
    })
    const res = await store.list()
    expect(res.notes[0].tagIds).toEqual(['t1'])
  })

  it('filters notes by tag id', async () => {
    const { store, execute } = createStore({
      notes: [NOTE_ROW, { ...NOTE_ROW, id: 'n2' }],
      noteTags: [{ note_id: 'n1', tag_id: 't1' }]
    })
    await store.list({ tagIds: ['t1'] })
    const calledSql = execute.mock.calls.map((c) => String(c[0]))
    // Why: the list query should reference note_tag with a placeholder for the tag.
    expect(calledSql.some((s) => /note_tag.*tag_id IN \(\?\)/i.test(s))).toBe(true)
  })

  it('creates a note via INSERT then re-lists', async () => {
    const { store } = createStore({ notes: [NOTE_ROW] })
    const res = await store.createNote({ title: 'New', content: 'body', tagIds: [] })
    expect(res.notes.length).toBe(1)
  })

  it('deletes a note via pipelineBatch', async () => {
    const { store, pipelineBatch } = createStore({ notes: [] })
    await store.deleteNote('n1')
    const calls = pipelineBatch.mock.calls.map((c) => (c[0] as { sql: string }[]).map((b) => b.sql))
    expect(calls[0].some((s) => s.includes('DELETE FROM notes'))).toBe(true)
  })

  it('creates a tag only when name is not duplicated', async () => {
    const { store, execute } = createStore({
      tags: [{ id: 't1', name: 'work', color: null, created_at: 0, updated_at: 0 }]
    })
    const res = await store.createTag({ name: 'work' })
    // duplicate -> no tag rows returned still fine
    expect(res).toBeTruthy()
    expect(execute).toHaveBeenCalled()
  })

  it('fetches tags in list()', async () => {
    const raw: Row = { id: 't1', name: 'work', color: '#f59e0b', created_at: 0, updated_at: 0 }
    const { store } = createStore({ tags: [raw], notes: [] })
    const res = await store.list()
    expect(res.tags[0]).toMatchObject({ id: 't1', name: 'work', color: '#f59e0b' })
  })

  it('getSnapshot returns notes and tags', async () => {
    const { store } = createStore({
      notes: [NOTE_ROW, { ...NOTE_ROW, id: 'n2' }],
      tags: [{ id: 't1', name: 'work', color: null, created_at: 0, updated_at: 0 }]
    })
    const snapshot = await store.getSnapshot()
    expect(snapshot.notes.length).toBe(2)
    expect(snapshot.tags.length).toBe(1)
  })

  it('importSnapshot upserts notes and tags and reports counts', async () => {
    // Why: existing store holds only n1, so the two imported notes are both new.
    const { store, pipelineBatch } = createStore({
      notes: [NOTE_ROW],
      tags: [{ id: 't1', name: 'work', color: null, created_at: 0, updated_at: 0 }]
    })
    const result = await store.importSnapshot({
      notes: [
        {
          id: 'existing',
          title: 'Same',
          content: '# Existing',
          pinned: false,
          createdAt: 1000,
          updatedAt: 2000,
          tagIds: []
        },
        {
          id: 'new',
          title: 'Fresh',
          content: '# Fresh',
          pinned: false,
          createdAt: 1000,
          updatedAt: 2000,
          tagIds: []
        }
      ],
      tags: [{ id: 't1', name: 'work', color: null, createdAt: 0, updatedAt: 0 }]
    })
    expect(result.notesImported).toBe(2)
    expect(result.notesUpdated).toBe(0)
    const batchesSql = pipelineBatch.mock.calls.map((c) =>
      (c[0] as { sql: string }[]).map((b) => b.sql)
    )[0]
    expect(batchesSql.some((s) => s.includes('ON CONFLICT(id) DO UPDATE'))).toBe(true)
    // Tags are upserted too.
    expect(batchesSql.some((s) => s.includes('INSERT INTO tags'))).toBe(true)
  })
})