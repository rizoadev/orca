import { homedir } from 'node:os'
import { basename, join } from 'node:path'

/**
 * Pi shards session logs per project under `<home>/agent/sessions/<project>/<start>_<id>.jsonl`.
 * PI_CODING_AGENT_DIR may point at the Pi home, the `agent` directory, or the sessions root itself.
 */
export function resolvePiSessionsDir(
  override = process.env.PI_CODING_AGENT_DIR,
  home = homedir()
): string {
  const configured = override?.trim()
  if (!configured) {
    return join(home, '.pi', 'agent', 'sessions')
  }
  const normalized = configured.replace(/[\\/]+$/, '')
  const leaf = basename(normalized)
  if (leaf === 'sessions') {
    return normalized
  }
  if (leaf === 'agent') {
    return join(normalized, 'sessions')
  }
  return leaf === '.pi' ? join(normalized, 'agent', 'sessions') : normalized
}
