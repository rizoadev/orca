/**
 * Load local Strands secrets into process.env without a dotenv dependency.
 * Why: electron-vite does not automatically inject .env.local into the main process.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const STRANDS_ENV_KEYS = [
  'ORCA_STRANDS_PROVIDER',
  'ORCA_STRANDS_MODEL',
  'ORCA_STRANDS_API_KEY',
  'ORCA_STRANDS_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'ANTHROPIC_API_KEY'
] as const

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0) {
      continue
    }
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) {
      out[key] = value
    }
  }
  return out
}

function candidateEnvPaths(): string[] {
  const cwd = process.cwd()
  // Why: packaged / forked main may not share the repo cwd; also check app path roots.
  const roots = [cwd]
  try {
    // Optional electron import — CLI path has no electron.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { app?: { getAppPath?: () => string } }
    const appPath = electron.app?.getAppPath?.()
    if (appPath) {
      roots.push(appPath, join(appPath, '..'), join(appPath, '../..'))
    }
  } catch {
    // CLI / unit tests
  }
  const files = ['.env.local', '.env']
  const paths: string[] = []
  for (const root of roots) {
    for (const file of files) {
      paths.push(join(root, file))
    }
  }
  return paths
}

let loaded = false

/** Idempotent: fill missing STRANDS-related env vars from local env files. */
export function ensureStrandsEnvLoaded(): void {
  if (loaded) {
    return
  }
  loaded = true
  for (const filePath of candidateEnvPaths()) {
    if (!existsSync(filePath)) {
      continue
    }
    let parsed: Record<string, string>
    try {
      parsed = parseEnvFile(readFileSync(filePath, 'utf8'))
    } catch {
      continue
    }
    for (const key of STRANDS_ENV_KEYS) {
      if (!process.env[key]?.trim() && parsed[key]?.trim()) {
        process.env[key] = parsed[key]
      }
    }
  }
}

export function resetStrandsEnvLoadForTests(): void {
  loaded = false
}
