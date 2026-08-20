import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { AiVaultScanIssue } from '../../shared/ai-vault-types'
import { discoverFiles } from './session-scanner-discovery'
import type { AiVaultScanOptions, SessionFileDiscovery } from './session-scanner-types'

const DEEPSEEK_SESSIONS_DIR = join(
  process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'),
  'sessions'
)

export function deepseekDiscoveries(
  options: AiVaultScanOptions,
  wslHomeDirs: readonly string[],
  limit: number,
  issues: AiVaultScanIssue[]
): Promise<SessionFileDiscovery>[] {
  return sessionRootDirs(options.deepseekSessionsDir ?? DEEPSEEK_SESSIONS_DIR, wslHomeDirs, [
    '.dsh',
    'sessions'
  ]).map((rootDir) =>
    discoverFiles({
      rootDir,
      limit,
      agent: 'deepseek-harness',
      issues,
      extensions: ['.zstd'],
      // Why: DSH stores exactly one compressed transcript per session dir.
      filePredicate: (path) => basename(path) === 'session.jsonl.zstd'
    })
  )
}

function sessionRootDirs(
  hostRootDir: string,
  wslHomeDirs: readonly string[],
  segments: readonly string[]
): string[] {
  return [hostRootDir, ...wslHomeDirs.map((homeDir) => join(homeDir, ...segments))]
}
