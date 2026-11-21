import { ipcMain } from 'electron'
import type {
  TursoSnippet,
  TursoSnippetCreateInput,
  TursoSnippetDeleteResult,
  TursoSnippetIdArgs,
  TursoSnippetListArgs,
  TursoSnippetListResult,
  TursoSnippetResult
} from '../../../shared/turso/turso-snippet-types'

const SCHEMA_SQL =
  'CREATE TABLE IF NOT EXISTS orca_snippets (id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, branch TEXT NOT NULL, title TEXT NOT NULL, file_name TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)'

type TursoPipelineResponse = {
  results?: {
    type?: string
    error?: { message?: string }
    response?: {
      result?: {
        rows?: { type: string; value: string }[][]
      }
    }
  }[]
}

async function tursoExec(
  url: string,
  authToken: string,
  sql: string,
  args: string[] = []
): Promise<{ type: string; value: string }[][]> {
  const response = await fetch(new URL('/v2/pipeline', normalizeUrl(url)), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      // Why: libSQL pipeline args are tagged values, not bare JSON strings.
      requests: [
        { type: 'execute', stmt: { sql, args: args.map((value) => ({ type: 'text', value })) } },
        { type: 'close' }
      ]
    })
  })
  if (!response.ok) {
    throw new Error(`Turso HTTP ${response.status}: ${await response.text()}`)
  }
  const body = (await response.json()) as TursoPipelineResponse
  const result = body.results?.[0]
  if (result?.error) {
    throw new Error(result.error.message)
  }
  return result?.response?.result?.rows ?? []
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '')
  return trimmed.startsWith('libsql://') ? `https://${trimmed.slice('libsql://'.length)}` : trimmed
}

function rowToSnippet(row: { type: string; value: string }[]): TursoSnippet {
  return {
    id: row[0].value,
    repoId: row[1].value,
    branch: row[2].value,
    title: row[3].value,
    fileName: row[4].value,
    content: row[5].value,
    createdAt: row[6].value
  }
}

const SELECT_COLUMNS = 'id, repo_id, branch, title, file_name, content, created_at'

async function execWithSchema(
  url: string,
  authToken: string,
  sql: string,
  args: string[] = []
): Promise<{ type: string; value: string }[][]> {
  await tursoExec(url, authToken, SCHEMA_SQL)
  return tursoExec(url, authToken, sql, args)
}

export function registerTursoSnippetHandlers(): void {
  ipcMain.handle(
    'turso:snippets:create',
    async (_event, input: TursoSnippetCreateInput): Promise<TursoSnippetResult> => {
      try {
        const id = crypto.randomUUID()
        const createdAt = new Date().toISOString()
        await execWithSchema(
          input.url,
          input.authToken,
          'INSERT INTO orca_snippets (id, repo_id, branch, title, file_name, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, input.repoId, input.branch, input.title, input.fileName, input.content, createdAt]
        )
        return {
          ok: true,
          snippet: {
            id,
            repoId: input.repoId,
            branch: input.branch,
            title: input.title,
            fileName: input.fileName,
            content: input.content,
            createdAt
          }
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'turso:snippets:list',
    async (_event, args: TursoSnippetListArgs): Promise<TursoSnippetListResult> => {
      try {
        const rows = await execWithSchema(
          args.url,
          args.authToken,
          `SELECT ${SELECT_COLUMNS} FROM orca_snippets WHERE repo_id = ? ORDER BY created_at DESC LIMIT 200`,
          [args.repoId]
        )
        return { ok: true, items: rows.map(rowToSnippet) }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'turso:snippets:get',
    async (_event, args: TursoSnippetIdArgs): Promise<TursoSnippetResult> => {
      try {
        const rows = await execWithSchema(
          args.url,
          args.authToken,
          `SELECT ${SELECT_COLUMNS} FROM orca_snippets WHERE id = ?`,
          [args.snippetId]
        )
        if (rows.length === 0) {
          return { ok: false, error: 'Snippet not found' }
        }
        return { ok: true, snippet: rowToSnippet(rows[0]) }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    'turso:snippets:delete',
    async (_event, args: TursoSnippetIdArgs): Promise<TursoSnippetDeleteResult> => {
      try {
        await execWithSchema(args.url, args.authToken, 'DELETE FROM orca_snippets WHERE id = ?', [
          args.snippetId
        ])
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )
}
