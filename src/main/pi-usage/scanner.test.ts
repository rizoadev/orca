import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => tmpdir()) } }))

import { parsePiUsageLine, type PiUsageParseContext } from './pi-usage-record-parser'
import { scanPiUsageFiles } from './scanner'

const FIRST_AT = '2026-09-20T05:30:45.608Z'
const SECOND_AT = '2026-09-20T05:31:02.100Z'

function sessionHeader(cwd: string): Record<string, unknown> {
  return { type: 'session', version: 3, id: 'session-header', timestamp: FIRST_AT, cwd }
}

function assistant(
  timestamp: string,
  usage: { input: number; output: number; cacheRead?: number; cacheWrite?: number },
  model = 'ag/claude-opus-4-6-thinking'
): Record<string, unknown> {
  return {
    type: 'message',
    id: `record-${timestamp}-${usage.input}`,
    parentId: null,
    timestamp,
    message: {
      role: 'assistant',
      provider: 'antigravity',
      model,
      content: [{ type: 'text', text: 'ok' }],
      usage: {
        reasoning: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: { total: 0 },
        ...usage,
        totalTokens: usage.input + usage.output
      }
    }
  }
}

function toJsonl(records: Record<string, unknown>[]): string {
  return `${records.map((entry) => JSON.stringify(entry)).join('\n')}\n`
}

describe('parsePiUsageLine', () => {
  it('reads the session workspace and folds cache reads into gross input', () => {
    const context: PiUsageParseContext = { sessionId: 's1', cwd: null }
    expect(parsePiUsageLine(JSON.stringify(sessionHeader('/workspace/repo')), context)).toEqual([])
    expect(context.cwd).toBe('/workspace/repo')

    const [event] = parsePiUsageLine(
      JSON.stringify(assistant(FIRST_AT, { input: 4_569, output: 275, cacheRead: 20_181 })),
      context
    )
    // Pi totals input + output + cache read, so cached tokens are input-side but unbilled as new input.
    expect(event).toMatchObject({
      sessionId: 's1',
      timestamp: FIRST_AT,
      model: 'ag/claude-opus-4-6-thinking',
      cwd: '/workspace/repo',
      inputTokens: 24_750,
      cachedInputTokens: 20_181,
      outputTokens: 275,
      totalTokens: 25_025
    })
  })

  it('ignores non-assistant and usage-less records', () => {
    const context: PiUsageParseContext = { sessionId: 's1', cwd: null }
    const user = {
      type: 'message',
      timestamp: FIRST_AT,
      message: { role: 'user', content: 'hi' }
    }
    expect(parsePiUsageLine(JSON.stringify(user), context)).toEqual([])
    expect(parsePiUsageLine('{"type":"model_change","modelId":"x"}', context)).toEqual([])
    expect(parsePiUsageLine('not json', context)).toEqual([])
  })
})

describe('scanPiUsageFiles', () => {
  let root: string
  let sessionsDir: string
  let worktreePath: string

  beforeEach(async () => {
    root = await realpath(mkdtempSync(join(tmpdir(), 'pi-usage-')))
    sessionsDir = join(root, 'sessions')
    worktreePath = join(root, 'repo')
    mkdirSync(worktreePath, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function writeSession(project: string, name: string, records: Record<string, unknown>[]): string {
    const dir = join(sessionsDir, project)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${name}.jsonl`)
    writeFileSync(file, toJsonl(records))
    return file
  }

  const worktrees = (): {
    repoId: string
    worktreeId: string
    path: string
    displayName: string
  }[] => [{ repoId: 'repo-1', worktreeId: 'wt-1', path: worktreePath, displayName: 'repo/main' }]

  it('aggregates assistant usage and attributes it to the Orca worktree', async () => {
    writeSession('--repo--', 'run-a', [
      sessionHeader(worktreePath),
      assistant(FIRST_AT, { input: 1_000, output: 100, cacheRead: 400 }),
      assistant(SECOND_AT, { input: 500, output: 50 })
    ])
    writeSession('--elsewhere-project--', 'run-b', [
      sessionHeader('/elsewhere/project'),
      assistant(FIRST_AT, { input: 7, output: 3 }, 'ag/gemini-3.8-flash')
    ])

    const result = await scanPiUsageFiles(worktrees(), [], undefined, sessionsDir)

    expect(result.processedFiles).toHaveLength(2)
    const byId = new Map(result.sessions.map((session) => [session.sessionId, session]))
    expect(byId.get('run-a')).toMatchObject({
      eventCount: 2,
      totalInputTokens: 1_900,
      totalCachedInputTokens: 400,
      totalOutputTokens: 150,
      totalTokens: 2_050,
      primaryWorktreeId: 'wt-1',
      primaryProjectLabel: 'repo/main'
    })
    expect(byId.get('run-b')).toMatchObject({
      totalTokens: 10,
      primaryWorktreeId: null,
      primaryModel: 'ag/gemini-3.8-flash'
    })
    expect(result.dailyAggregates.reduce((sum, row) => sum + row.totalTokens, 0)).toBe(2_060)
  })

  it('counts a usage record copied into a forked session once', async () => {
    const shared = assistant(FIRST_AT, { input: 100, output: 10 })
    writeSession('--repo--', 'a-parent', [sessionHeader(worktreePath), shared])
    writeSession('--repo--', 'b-fork', [sessionHeader(worktreePath), shared])

    const result = await scanPiUsageFiles(worktrees(), [], undefined, sessionsDir)

    expect(result.dailyAggregates.reduce((sum, row) => sum + row.totalTokens, 0)).toBe(110)
  })

  it('reuses unchanged logs instead of reparsing them', async () => {
    writeSession('--repo--', 'stable', [
      sessionHeader(worktreePath),
      assistant(FIRST_AT, { input: 100, output: 10 })
    ])
    const first = await scanPiUsageFiles(worktrees(), [], undefined, sessionsDir)

    const onFilesScanned = vi.fn()
    const second = await scanPiUsageFiles(
      worktrees(),
      first.processedFiles,
      onFilesScanned,
      sessionsDir
    )

    expect(onFilesScanned).not.toHaveBeenCalled()
    expect(second.sessions[0]?.totalTokens).toBe(110)
  })
})
