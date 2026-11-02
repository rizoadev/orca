import type { TuiAgent } from '../../../../../../shared/tui-agent'

export function useIssueListAgents(_connectionId: string | null | undefined): {
  agents: TuiAgent[]
  detectingAgents: boolean
} {
  return { agents: [], detectingAgents: false }
}
