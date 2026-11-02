// Stub — AI work registry not wired in orca-clean.
// Entries are intentionally absent so no "AI booting" badge renders.
export type IssueAiWorkRegistryEntry = {
  tabId: string
  paneKey?: string
  startedAt: number
  outcome?: 'succeeded' | 'failed'
}

export function registerIssueAiWork(_args: unknown): string {
  return ''
}

export function updateIssueAiWorkOutcome(_id: string, _outcome: string): void {}

/** No tracked runs → badge stays hidden. */
export function useIssueAiWorkEntry(_registryId: string): IssueAiWorkRegistryEntry | null {
  return null
}

export function useIssueAiWorkRegistry(_issueId: string): IssueAiWorkRegistryEntry | null {
  return null
}
