// Stub — AI plan not available yet
import type { TuiAgent } from '../../../../../../shared/tui-agent'
import type { Repo } from '../../../../../../shared/repo-types'

export async function launchIssueAiPlanCommenter(_args: {
  worktreeId: string
  repo: Repo
  agent: TuiAgent
  issue: {
    provider: string
    number: number | null
    identifier: string | null
    title: string
    url: string
    body?: string
  }
}): Promise<void> {}
