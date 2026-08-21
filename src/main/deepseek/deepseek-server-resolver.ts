/**
 * Binary + home resolution for the DeepSeek Harness web host, kept out of the
 * manager for its line budget.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

// Why: the web host spawns its own Harness runtime home; keep it isolated from
// the user's real ~/.dsh so Orca-managed sessions stay scoped to Orca's data.
export function harnessHome(): string {
  return process.env.DSH_HOME?.trim() || `${app.getPath('userData')}/dsh-home`
}

// Why: Electron may launch with a bare PATH (e.g. from a desktop launcher) that
// omits npm's global bin, where `dsh` lives. Resolve the binary explicitly
// instead of relying on the inherited environment.
export function resolveDshBin(): string | null {
  const override = process.env.DSH_BIN?.trim()
  if (override && existsSync(override)) {
    return override
  }
  const pathDirs = (process.env.PATH ?? '').split(':').filter(Boolean)
  for (const dir of pathDirs) {
    for (const name of ['dsh', 'dsh.cmd', 'dsh.exe']) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  // Why: `npm i -g` installs into the npm global prefix; probe the common
  // locations directly so a PATH-less Electron process still finds it.
  const npmGlobalCandidates = [
    process.env.NPM_CONFIG_PREFIX,
    join(homedir(), '.npm-global'),
    join(homedir(), 'node_modules')
  ]
  for (const prefix of npmGlobalCandidates) {
    if (!prefix) {
      continue
    }
    for (const name of ['dsh', 'dsh.cmd', 'dsh.exe']) {
      const candidate = join(prefix, 'bin', name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  // Why: nvm-style installs put global bins under the nvm node prefix, which
  // PATH-less GUI launches and the fixed candidate list both miss; `npm prefix -g`
  // reports the real prefix cheaply.
  try {
    const prefix = execFileSync('npm', ['prefix', '-g'], {
      encoding: 'utf8',
      timeout: 3_000
    }).trim()
    if (prefix) {
      for (const name of ['dsh', 'dsh.cmd', 'dsh.exe']) {
        const candidate = join(prefix, 'bin', name)
        if (existsSync(candidate)) {
          return candidate
        }
      }
    }
  } catch {
    // npm unavailable (e.g. bare GUI PATH) — fall through; PATH/DSH_BIN still apply
  }
  return null
}
