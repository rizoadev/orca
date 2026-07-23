// Tracks which issue rows have an active AI worker session and their pane keys,
// so the Issues list can render live status badges without re-plumbing through
// the wider automations store. Scope is intentionally in-memory + per-session:
// on refresh the underlying tab still exists, but the badge simply resets to
// unknown until the user relaunches (matches "background terminal" semantics).

import { useSyncExternalStore } from 'react'

export type IssueAiWorkEntry = {
  worktreeId: string
  tabId: string
  /** Optional live pane key when known at launch time (background mode). Watch
   *  mode omits it — the badge resolves the pane by tabId prefix instead. */
  paneKey?: string
  agentLabel?: string
  startedAt: number
  /** 'watch' means the tab was auto-activated; 'background' stays hidden. */
  mode: 'background' | 'watch'
  /** Latest terminal completion outcome once the run has ended, if known. */
  outcome?: 'succeeded' | 'failed'
  /** Branch created for this AI run, so post-completion actions know what to
   *  merge/delete without re-deriving it from the issue title. */
  branchName?: string
  /** Repo id that owns the branch/worktree; needed by merge/delete flows. */
  repoId?: string
}

const entriesByIssueId = new Map<string, IssueAiWorkEntry>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function registerIssueAiWork(issueId: string, entry: IssueAiWorkEntry): void {
  entriesByIssueId.set(issueId, entry)
  emit()
}

export function updateIssueAiWorkOutcome(
  issueId: string,
  outcome: NonNullable<IssueAiWorkEntry['outcome']>
): void {
  const current = entriesByIssueId.get(issueId)
  if (!current || current.outcome === outcome) {
    return
  }
  entriesByIssueId.set(issueId, { ...current, outcome })
  emit()
}

export function clearIssueAiWork(issueId: string): void {
  if (!entriesByIssueId.delete(issueId)) {
    return
  }
  emit()
}

export function clearAllIssueAiWorkForTests(): void {
  entriesByIssueId.clear()
  emit()
}

export function getIssueAiWorkEntry(issueId: string): IssueAiWorkEntry | undefined {
  return entriesByIssueId.get(issueId)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): Map<string, IssueAiWorkEntry> {
  return entriesByIssueId
}

export function useIssueAiWorkEntry(issueId: string): IssueAiWorkEntry | undefined {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return snapshot.get(issueId)
}
