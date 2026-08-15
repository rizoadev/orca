import { afterEach, describe, expect, it, vi } from 'vitest'
import { TursoClient } from './turso-client'

function mockFetch(resultBody: unknown): void {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(resultBody)),
    json: () => Promise.resolve(resultBody)
  })
  vi.stubGlobal('fetch', fetchMock)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TursoClient', () => {
  it('derives the Hrana HTTP URL from a libsql:// URL', () => {
    expect(TursoClient.hranaHttpUrl('libsql://orca-abc.turso.io')).toBe(
      'https://orca-abc.turso.io/v2/pipeline'
    )
    expect(TursoClient.hranaHttpUrl('https://orca-abc.turso.io/')).toBe(
      'https://orca-abc.turso.io/v2/pipeline'
    )
  })

  it('serializes typed SQL values and reads typed rows', async () => {
    mockFetch({
      results: [
        {
          type: 'ok',
          response: {
            type: 'execute',
            result: {
              cols: [{ name: 'name' }, { name: 'count' }, { name: 'score' }],
              rows: [
                [
                  { type: 'text', value: 'hello' },
                  { type: 'integer', value: '3' },
                  { type: 'real', value: '1.5' }
                ]
              ]
            }
          }
        }
      ]
    })
    const client = new TursoClient('libsql://orca-abc.turso.io', 'token')
    const res = await client.execute('SELECT name, count, score FROM notes')
    expect(res.rows[0]).toEqual({ name: 'hello', count: 3, score: 1.5 })

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sentBody.requests[0].stmt.sql).toBe('SELECT name, count, score FROM notes')
  })

  it('passes integer args as tagged values', async () => {
    mockFetch({
      results: [
        { type: 'ok', response: { type: 'execute', result: { cols: [], rows: [] } } }
      ]
    })
    const client = new TursoClient('libsql://orca-abc.turso.io', 'token')
    await client.execute('INSERT INTO notes (id, n) VALUES (?, ?)', ['a', 7])
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sentBody.requests[0].stmt.args).toEqual([
      { type: 'text', value: 'a' },
      { type: 'integer', value: '7' }
    ])
  })

  it('throws on a statement error response', async () => {
    mockFetch({
      results: [{ type: 'error', error: { message: 'no such table: notes' } }]
    })
    const client = new TursoClient('libsql://orca-abc.turso.io', 'token')
    await expect(client.execute('SELECT * FROM missing')).rejects.toThrow(
      'no such table: notes'
    )
  })

  it('throws on non-ok http and surfaces the error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: { message: 'unauthorized' } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new TursoClient('libsql://orca-abc.turso.io', 'bad-token')
    await expect(client.execute('SELECT 1')).rejects.toThrow(/unauthorized/)
  })
})
