import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'

export function isolatedScanRoots(root: string) {
  return {
    claudeProjectsDir: join(root, 'claude-projects'),
    codexSessionsDir: join(root, 'codex-sessions'),
    geminiSessionsDir: join(root, 'gemini-sessions'),
    antigravityBrainDir: join(root, 'antigravity-brain'),
    copilotSessionsDir: join(root, 'copilot-sessions'),
    cursorProjectsDir: join(root, 'cursor-projects'),
    opencodeStorageDir: join(root, 'opencode-storage'),
    // Why: prevent the SQLite scanner from picking up the real
    // ~/.local/share/opencode/opencode.db during tests.
    opencodeDbPaths: [] as readonly string[],
    grokSessionsDir: join(root, 'grok-sessions'),
    devinTranscriptsDir: join(root, 'devin-transcripts'),
    hermesSessionsDir: join(root, 'hermes-sessions'),
    rovoSessionsDir: join(root, 'rovo-sessions'),
    openclawStateDir: join(root, 'openclaw-state'),
    openclawLegacyStateDir: join(root, 'openclaw-legacy-state'),
    piSessionsDir: join(root, 'pi-sessions'),
    ompSessionsDir: join(root, 'omp-sessions'),
    droidSessionsDir: join(root, 'droid-sessions'),
    droidProjectsDir: join(root, 'droid-projects'),
    kimiSessionsDir: join(root, 'kimi-sessions'),
    deepseekSessionsDir: join(root, 'deepseek-sessions')
  }
}

export function jsonLines(records: unknown[]): string {
  return records.map((record) => JSON.stringify(record)).join('\n')
}

export async function writeJsonlFile(filePath: string, records: unknown[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, jsonLines(records))
}

export async function writeAntigravityTranscript(
  brainDir: string,
  sessionId: string,
  records: unknown[]
): Promise<string> {
  const transcriptPath = join(brainDir, sessionId, '.system_generated', 'logs', 'transcript.jsonl')
  await writeJsonlFile(transcriptPath, records)
  return transcriptPath
}

export function writeAntigravityHistory(brainDir: string, records: unknown[]): Promise<void> {
  return writeJsonlFile(join(dirname(brainDir), 'history.jsonl'), records)
}

export function writeAntigravityScannerFixture(
  brainDir: string,
  sessionId: string
): Promise<string> {
  return writeAntigravityTranscript(brainDir, sessionId, [
    {
      source: 'USER_EXPLICIT',
      type: 'USER_INPUT',
      created_at: '2026-05-01T10:02:30.000Z',
      content: '<USER_REQUEST>Antigravity title</USER_REQUEST>'
    },
    {
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      created_at: '2026-05-01T10:02:31.000Z',
      content: 'Done'
    }
  ])
}

export async function writeDeepSeekScannerFixture(sessionsDir: string): Promise<string> {
  const sessionId = 'session-12345678-1234-4234-8234-123456789012'
  const sessionDir = join(sessionsDir, sessionId)
  const records = [
    {
      type: 'session',
      id: sessionId,
      createdAt: 1_777_634_700_000,
      cwd: '/tmp/deepseek'
    },
    {
      type: 'session/title',
      time: 1_777_634_701_000,
      data: { title: 'DeepSeek title' }
    },
    {
      type: 'assistant/message',
      time: 1_777_634_702_000,
      data: {
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'DeepSeek answer' }],
          source: { kind: 'model', model: 'deepseek-v4' }
        }
      }
    }
  ]
  await mkdir(sessionDir, { recursive: true })
  await writeFile(
    join(sessionDir, 'session.jsonl.zstd'),
    Buffer.concat(
      records.map((record) => zstdCompressSync(Buffer.from(`${JSON.stringify(record)}\n`)))
    )
  )
  return sessionId
}
