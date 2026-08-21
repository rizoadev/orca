/**
 * Binary / entrypoint resolution for the OpenChamber web server.
 *
 * Electron may launch with a bare PATH (e.g. desktop launcher) that omits the
 * OpenCode CLI and npm install locations, so the manager resolves the opencode
 * binary, a real node binary, and the @openchamber/web server entrypoint
 * explicitly instead of relying on the inherited environment.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Resolve a real node binary: Orca's own process.execPath is the Electron
 * binary, which cannot run a plain Node ESM entrypoint. Pick `node` from PATH
 * (or an explicit override) instead, mirroring PaseoDaemonManager. */
export function resolveNodeBin(): string {
  const override = process.env.OPENCHAMBER_NODE_BIN?.trim()
  if (override && existsSync(override)) {
    return override
  }
  return (
    (process.env.PATH ?? '')
      .split(':')
      .map((dir) => join(dir, 'node'))
      .find((candidate) => existsSync(candidate)) || 'node'
  )
}

/** Resolve the OpenChamber web server entrypoint from env, repo or npm global. */
export function resolveOpenChamberServerEntrypoint(): string | null {
  // Why: explicit override wins — lets ops point at a repo checkout or built dist.
  const override = process.env.OPENCHAMBER_REPO_DIR?.trim()
  if (override && existsSync(override)) {
    const fromRepo = resolveServerEntrypoint(override)
    if (fromRepo) {
      return fromRepo
    }
  }
  // Why: dev default — the sandbox checkout next to orca.
  const defaultRepo = join(homedir(), 'PROJECTS', 'SANDBOX', 'openchamber')
  if (existsSync(defaultRepo)) {
    const fromRepo = resolveServerEntrypoint(defaultRepo)
    if (fromRepo) {
      return fromRepo
    }
  }
  // Why: remote hosts have no repo checkout; @openchamber/web is installed as
  // a global npm package there (main: server/index.js). Resolve its entrypoint.
  const fromNpm = resolveNpmGlobalEntrypoint()
  if (fromNpm) {
    return fromNpm
  }
  return null
}

/** Resolve @openchamber/web's server/index.js from the npm global root. */
function resolveNpmGlobalEntrypoint(): string | null {
  const roots: string[] = []
  // Why: probe `npm root -g` first — it knows the real prefix (nvm, custom installs).
  try {
    const prefix = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      timeout: 5_000
    }).trim()
    if (prefix) {
      roots.push(prefix)
    }
  } catch {
    // npm unavailable — fall through to known prefixes
  }
  // Why: fall back to the common prefixes when npm is not on PATH.
  roots.push(join('/usr/local/lib/node_modules'))
  const nvmRoot = join(homedir(), '.nvm', 'versions')
  try {
    const nodeVersion = execFileSync('node', ['--version'], {
      encoding: 'utf8',
      timeout: 3_000
    }).trim()
    roots.push(join(nvmRoot, nodeVersion, 'lib', 'node_modules'))
  } catch {
    // ignore
  }
  for (const root of roots) {
    const candidate = join(root, '@openchamber', 'web', 'server', 'index.js')
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/** Resolve the server entrypoint file under the repo, preferring a built one. */
function resolveServerEntrypoint(repo: string): string | null {
  const candidates = [
    join(repo, 'packages', 'web', 'server', 'index.js'),
    join(repo, 'packages', 'web', 'dist', 'server', 'index.js')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/** Resolve the opencode CLI binary (the agent engine OpenChamber manages). */
export function resolveOpencodeBin(): string | null {
  const override = process.env.OPENCODE_BIN?.trim() || process.env.OPENCODE_BINARY?.trim()
  if (override && existsSync(override)) {
    return override
  }
  const pathDirs = (process.env.PATH ?? '').split(':').filter(Boolean)
  for (const dir of pathDirs) {
    for (const name of ['opencode', 'opencode.cmd', 'opencode.exe']) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  // Why: `bun add -g @opencode-ai/cli` installs into the global bin; probe the
  // common locations directly so a PATH-less Electron process still finds it.
  const npmGlobalCandidates = [
    process.env.NPM_CONFIG_PREFIX,
    process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, 'bin') : null,
    join(homedir(), '.npm-global'),
    join(homedir(), '.bun', 'bin')
  ]
  for (const prefix of npmGlobalCandidates) {
    if (!prefix) {
      continue
    }
    for (const name of ['opencode', 'opencode.cmd', 'opencode.exe']) {
      const candidate = join(prefix, 'bin', name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  return null
}
