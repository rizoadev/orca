// Stub — AI work registry not available yet
export type IssueAiWorkRegistryEntry = { status: 'idle' | 'working' | 'done' | 'failed' }

export function registerIssueAiWork(_args: unknown): string {
  return ''
}

export function updateIssueAiWorkOutcome(_id: string, _outcome: string): void {}

export function useIssueAiWorkEntry(_registryId: string): IssueAiWorkRegistryEntry {
  return { status: 'idle' }
}

export function useIssueAiWorkRegistry(_issueId: string): IssueAiWorkRegistryEntry {
  return { status: 'idle' }
}
