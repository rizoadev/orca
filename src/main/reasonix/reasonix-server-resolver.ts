/**
 * Binary resolution for the Reasonix web server.
 *
 * Electron may launch with a bare PATH (e.g. desktop launcher) that omits the
 * reasonix CLI, so the manager resolves the binary explicitly instead of
 * relying on the inherited environment. Reasonix is a single Go binary, so no
 * node entrypoint or separate agent-engine binary is needed (unlike OpenChamber).
 */
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Common build-output locations for the reasonix binary inside a checkout. */
const REPO_BINARY_RELATIVES = [
  'reasonix',
  'reasonix.exe',
  join('bin', 'reasonix'),
  join('bin', 'reasonix.exe'),
  join('dist', 'reasonix'),
  join('cmd', 'reasonix', 'reasonix')
]

/** Search `dir` for a built reasonix binary; returns the first hit or null. */
function findBinaryInDir(dir: string): string | null {
  for (const relative of REPO_BINARY_RELATIVES) {
    const candidate = join(dir, relative)
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/** Resolve the reasonix binary: explicit override, then PATH, then common homes. */
export function resolveReasonixBinary(): string | null {
  const override = process.env.REASONIX_BINARY?.trim() || process.env.REASONIX_BIN?.trim()
  if (override) {
    // Why: an override may point at the binary file OR a checkout dir — search
    // inside a directory so `REASONIX_REPO_DIR` works without knowing the build path.
    if (existsSync(override) && !override.endsWith('.toml')) {
      if (statSync(override).isFile()) {
        return override
      }
      const inside = findBinaryInDir(override)
      if (inside) {
        return inside
      }
    }
  }
  // Why: REASONIX_REPO_DIR points at a checkout, not the binary itself.
  const repoDir = process.env.REASONIX_REPO_DIR?.trim()
  if (repoDir && existsSync(repoDir)) {
    const inside = findBinaryInDir(repoDir)
    if (inside) {
      return inside
    }
  }
  const pathDirs = (process.env.PATH ?? '').split(':').filter(Boolean)
  for (const dir of pathDirs) {
    for (const name of ['reasonix', 'reasonix.exe']) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  // Why: dev defaults — a checkout next to orca (single Go binary build).
  const defaultRepo = join(homedir(), 'PROJECTS', 'SANDBOX', 'reasonix')
  const candidates = [defaultRepo, join(homedir(), 'go', 'bin', 'reasonix')]
  for (const candidate of candidates) {
    const inside = findBinaryInDir(candidate)
    if (inside) {
      return inside
    }
  }
  return null
}
