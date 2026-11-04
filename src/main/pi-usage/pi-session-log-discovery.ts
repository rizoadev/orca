import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { resolvePiSessionsDir } from '../../shared/pi-session-paths'

const SESSION_LOG = /\.jsonl$/

export type PiSessionLogRef = {
  path: string
  /** Session ID from the log filename; the header carries the same value. */
  sessionId: string
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/** Sorted paths make duplicate-ownership resolution deterministic across scans. */
export async function listPiSessionLogFiles(
  sessionsDir = resolvePiSessionsDir()
): Promise<PiSessionLogRef[]> {
  const logs: PiSessionLogRef[] = []
  let projectDirs: string[]
  try {
    projectDirs = (await readdir(sessionsDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch (error) {
    // A missing root means no Pi usage yet; other unreadable roots must surface scan errors.
    if (isMissingPathError(error)) {
      return logs
    }
    throw error
  }
  for (const projectDir of projectDirs) {
    const dirPath = join(sessionsDir, projectDir)
    let entries
    try {
      entries = await readdir(dirPath, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isFile() || !SESSION_LOG.test(entry.name)) {
        continue
      }
      logs.push({
        path: join(dirPath, entry.name),
        sessionId: entry.name.slice(0, -'.jsonl'.length)
      })
    }
  }
  return logs.sort((left, right) => left.path.localeCompare(right.path))
}
