// Why: Turso exposes libSQL over an HTTP Hrana API. We talk to /v2/pipeline
// directly so the app needs no native/Rust libsql client (keeps the Linux glibc
// floor clean per AGENTS.md) and the connection is plain authenticated HTTPS.

type HranaError = { message?: string; code?: string }

// Why: Hrana `positional` args are arrays where values are tagged records.
type SqlValue =
  | { type: 'integer'; value: string }
  | { type: 'real'; value: string }
  | { type: 'text'; value: string }
  | { type: 'blob'; value: string }
  | { type: 'null' }

type ExecResult = {
  sort_orders?: unknown
  cols?: { name: string; decltype: string | null }[]
  rows?: SqlValue[][]
  affected_row_count?: number
  last_insert_rowid?: string | null
}

export type TursoStatementResult = {
  cols: { name: string; decltype: string | null }[]
  rows: Record<string, string | number | null>[]
  affectedRowCount: number
  lastInsertRowId: string | null
}

type Statement = { sql: string; args?: { type: string; value: string }[] }
type PipelineRequest = { type: 'execute'; stmt: Statement }

export class TursoClient {
  private readonly baseUrl: string
  private readonly authToken: string

  constructor(dbUrl: string, authToken: string) {
    // Why: the Hrana HTTP endpoint is derived from the libsql:// URL by
    // switching scheme to https and appending /v2/pipeline.
    this.baseUrl = TursoClient.hranaHttpUrl(dbUrl)
    this.authToken = authToken
  }

  static hranaHttpUrl(dbUrl: string): string {
    if (dbUrl.startsWith('https://')) {
      return `${dbUrl.replace(/\/$/, '')}/v2/pipeline`
    }
    if (dbUrl.startsWith('libsql://')) {
      return `https://${dbUrl.slice('libsql://'.length).replace(/\/$/, '')}/v2/pipeline`
    }
    throw new Error(`Unsupported Turso database URL: ${dbUrl}`)
  }

  async execute(sql: string, args?: (string | number | null)[]): Promise<TursoStatementResult> {
    const requests = this.buildRequests([{ sql, args }])
    const rows = await this.pipeline(requests)
    return rows[0]
  }

  async pipelineBatch(batches: { sql: string; args?: (string | number | null)[] }[]): Promise<TursoStatementResult[]> {
    return this.pipeline(this.buildRequests(batches))
  }

  private buildRequests(
    batches: { sql: string; args?: (string | number | null)[] }[]
  ): PipelineRequest[] {
    return batches.map((batch) => {
      const stmt: Statement = { sql: batch.sql }
      if (batch.args && batch.args.length > 0) {
        stmt.args = batch.args.map((value) => TursoClient.toSqlValue(value))
      }
      return { type: 'execute', stmt }
    })
  }

  private static toSqlValue(value: string | number | null): { type: string; value: string } {
    if (value === null) {
      return { type: 'null', value: '' }
    }
    if (typeof value === 'number') {
      return Number.isInteger(value)
        ? { type: 'integer', value: String(value) }
        : { type: 'real', value: String(value) }
    }
    return { type: 'text', value }
  }

  private transformRow(row: SqlValue[] | undefined, cols: { name: string }[]): Record<string, string | number | null> {
    const out: Record<string, string | number | null> = {}
    if (!row) {
      return out
    }
    for (let i = 0; i < row.length; i += 1) {
      const col = cols[i]?.name ?? String(i)
      const value = row[i]
      if (value.type === 'null') {
        out[col] = null
      } else if (value.type === 'integer') {
        out[col] = Number(value.value)
      } else if (value.type === 'real') {
        out[col] = Number(value.value)
      } else {
        out[col] = value.value
      }
    }
    return out
  }

  private async pipeline(
    requests: PipelineRequest[]
  ): Promise<TursoStatementResult[]> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let message = text
      try {
        const parsed = JSON.parse(text) as { error?: HranaError }
        message = parsed.error?.message ?? text
      } catch {
        // keep raw text
      }
      throw new Error(`Turso request failed (${response.status}): ${message}`)
    }
    const data = (await response.json()) as {
      results: { type: string; response?: { type: string; result?: ExecResult }; error?: HranaError }[]
    }
    const out: TursoStatementResult[] = []
    for (const item of data.results) {
      if (item.type === 'error') {
        throw new Error(`Turso statement error: ${item.error?.message ?? 'unknown'}`)
      }
      const result = item.response?.result
      out.push({
        cols: result?.cols ?? [],
        rows: (result?.rows ?? []).map((row) => this.transformRow(row, result?.cols ?? [])),
        affectedRowCount: result?.affected_row_count ?? 0,
        lastInsertRowId: result?.last_insert_rowid ?? null
      })
    }
    return out
  }
}
