// Stub — create/close actions (linear mutations not available yet)
import type { Repo } from '../../../../../../shared/repo-types'
import type { IssueRow } from './issues-panel-rows'

export async function closeRepoIssue(_args: {
  repo: Repo
  row: IssueRow
}): Promise<boolean> {
  return false
}

export async function createRepoIssue(_args: unknown): Promise<null> {
  return null
}
