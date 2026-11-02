// Tracks which issue rows have an active AI worker session and their pane keys,
// so the Issues list can render live status badges without re-plumbing through
// the wider automations store. Scope is intentionally in-memory + per-session:
// on refresh the underlying tab still exists, but the badge simply resets to
// unknown until the user relaunches (matches "background terminal" semantics).

import { useSyncExternalStore } from 'react'
import {
  formatCoalescedPrompt,
  tryCoalesceFollowUp,
  type CoalesceFollowUpResult
} from '../../../../shared/agent-followup-coalesce'
import {
  classifyDirectHuman,
  type AgentRunAttribution
} from '../../../../shared/agent-run-attribution'

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
  /** Pending follow-ups folded before the worker session is live. */
  pendingMessages?: string[]
  /** Explainable provenance for this AI issue run. */
  attribution?: AgentRunAttribution
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

/** Fold a follow-up into a not-yet-finished issue AI launch when possible. */
export function coalesceIssueAiWorkFollowUp(args: {
  issueId: string
  message: string
  originatorId?: string | null
}): CoalesceFollowUpResult {
  const current = entriesByIssueId.get(args.issueId)
  if (!current) {
    return { outcome: 'no_pending', targetKey: args.issueId }
  }
  // Why: once outcome is set the worker finished — new work must launch fresh.
  if (current.outcome) {
    return { outcome: 'no_pending', targetKey: args.issueId, reason: `outcome=${current.outcome}` }
  }
  // Why: empty worktreeId means a pre-spawn placeholder; otherwise the run is live.
  const state = current.worktreeId.trim().length === 0 && !current.paneKey ? 'pending' : 'running'
  const nextAttribution = args.originatorId
    ? classifyDirectHuman({
        originatorId: args.originatorId,
        evidenceKind: 'followup',
        evidenceRefId: args.issueId
      })
    : undefined
  const result = tryCoalesceFollowUp({
    targetKey: args.issueId,
    state,
    existingMessages: current.pendingMessages ?? [],
    nextMessage: args.message,
    existingAttribution: current.attribution,
    nextAttribution
  })
  if (result.outcome !== 'merged') {
    return result
  }
  entriesByIssueId.set(args.issueId, {
    ...current,
    pendingMessages: result.messages,
    ...(result.attribution ? { attribution: result.attribution } : {})
  })
  emit()
  return result
}

export function getIssueAiWorkCoalescedPrompt(issueId: string): string | null {
  const entry = entriesByIssueId.get(issueId)
  if (!entry?.pendingMessages?.length) {
    return null
  }
  return formatCoalescedPrompt(entry.pendingMessages)
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
