import type { TuiAgent } from '../../../../../../shared/tui-agent'

export function resolveLaunchAgent(_agents: TuiAgent[]): TuiAgent | null {
  return _agents[0] ?? null
}

export function buildIssueAgentStartup(_args: unknown): null {
  return null
}
