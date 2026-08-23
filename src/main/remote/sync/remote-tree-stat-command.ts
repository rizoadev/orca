// Why: one find+stat pass is the only affordable way to size a whole remote
// tree; GNU and BSD stat disagree on flags so both command forms live here.
import type { RemoteSyncFileEntry } from '../../../shared/remote-sync-types'

/** Single-quote against shell injection; `~` needs $HOME since quoting kills tilde expansion. */
export function escapeRemoteShellPath(s: string): string {
  if (s === '~') {
    return '"$HOME"'
  }
  if (s.startsWith('~/')) {
    return `"${'$HOME'}"/${escapeRaw(s.slice(2))}`
  }
  return escapeRaw(s)
}

function escapeRaw(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

const GNU_STAT_FORMAT = '%s\\t%Y\\t%n'
const BSD_STAT_FORMAT = '%z%t%m%t%N'

export function buildGnuTreeStatCommand(root: string): string {
  // Why: `command` skips aliases/functions; cd first so paths come back relative (stable object keys).
  return (
    `cd ${escapeRemoteShellPath(root)} && ` +
    `command find . -type f -exec command stat -c '${GNU_STAT_FORMAT}' -- {} +`
  )
}

export function buildBsdTreeStatCommand(root: string): string {
  return (
    `cd ${escapeRemoteShellPath(root)} && ` +
    `command find . -type f -exec command stat -f '${BSD_STAT_FORMAT}' -- {} +`
  )
}

/**
 * Parses `size<TAB>mtime<TAB>path` lines. Paths are relative like
 * `./docs/readme.md`; entries that fail to parse are skipped so a single odd
 * filename cannot poison the whole walk.
 */
export function parseTreeStatOutput(stdout: string): RemoteSyncFileEntry[] {
  const entries: RemoteSyncFileEntry[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.replace(/\r$/, '')
    if (trimmed.length === 0) {
      continue
    }
    const parts = trimmed.split('\t')
    if (parts.length !== 3) {
      continue
    }
    const size = Number(parts[0])
    const mtimeSeconds = Number(parts[1])
    if (!Number.isFinite(size) || !Number.isFinite(mtimeSeconds)) {
      continue
    }
    let relativePath = parts[2]
    if (relativePath.startsWith('./')) {
      relativePath = relativePath.slice(2)
    }
    if (relativePath.length === 0 || relativePath.includes('../')) {
      continue
    }
    entries.push({ relativePath, size, mtimeSeconds })
  }
  return entries
}
