// Stub — AI work not available yet (missing shared deps in orca-clean)
import type { TuiAgent } from '../../../../../../shared/tui-agent'
import type { Repo } from '../../../../../../shared/repo-types'

export type IssueAiWorkMode = 'plan-and-execute' | 'execute-only'

export async function launchIssueAiWorker(_args: {
  worktreeId: string
  repo: Repo
  agent: TuiAgent
  mode: IssueAiWorkMode
  issue: {
    provider: string
    number: number | null
    identifier: string | null
    workspaceId: string | null
    title: string
    url: string
    body?: string
  }
}): Promise<{ ok: boolean }> {
  return { ok: false }
}
