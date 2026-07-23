import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { classifyDirectHuman } from '../../../../shared/agent-run-attribution'
import type { IssueAiWorkMode } from './issues-panel-ai-work'
import {
  clearIssueAiWork,
  coalesceIssueAiWorkFollowUp,
  getIssueAiWorkEntry,
  registerIssueAiWork
} from './issue-ai-work-registry'

export type ClaimIssueAiWorkResult =
  | { action: 'coalesced' | 'already_running' }
  | { action: 'claimed'; pendingMessages: string[] }

/** Claim or coalesce the issue AI-work slot before createWorktree. */
export function claimOrCoalesceIssueAiWork(args: {
  registryId: string
  issueNumber: number
  prompt: string
  agent: string
  mode: IssueAiWorkMode
  branchName: string
  repoId: string
}): ClaimIssueAiWorkResult {
  const coalesced = coalesceIssueAiWorkFollowUp({
    issueId: args.registryId,
    message: args.prompt,
    originatorId: 'local-user'
  })
  if (coalesced.outcome === 'merged') {
    toast.success(
      translate(
        'auto.components.right.sidebar.issuesPanel.aiWorkCoalesced',
        'Queued follow-up for the existing AI run on #{{value0}}.',
        { value0: args.issueNumber }
      )
    )
    return { action: 'coalesced' }
  }
  if (coalesced.outcome === 'already_running') {
    // Why: Multica-style — never spawn a second worker while one is live for this issue.
    toast.message(
      translate(
        'auto.components.right.sidebar.issuesPanel.aiWorkAlreadyRunning',
        'AI is already working on #{{value0}}. Open that worktree to send a follow-up.',
        { value0: args.issueNumber }
      )
    )
    return { action: 'already_running' }
  }

  // Why: claim the issue slot before createWorktree so concurrent clicks coalesce
  // into this pending placeholder instead of racing a second worktree.
  clearIssueAiWork(args.registryId)
  registerIssueAiWork(args.registryId, {
    worktreeId: '',
    tabId: '',
    agentLabel: args.agent,
    startedAt: Date.now(),
    mode: args.mode,
    branchName: args.branchName,
    repoId: args.repoId,
    pendingMessages: [args.prompt],
    attribution: classifyDirectHuman({
      originatorId: 'local-user',
      evidenceKind: 'launch',
      evidenceRefId: args.registryId
    })
  })
  return { action: 'claimed', pendingMessages: [args.prompt] }
}

export function resolveIssueAiWorkRegistration(args: {
  registryId: string
  prompt: string
  worktreeId: string
  tabId: string
  agent: string
  mode: IssueAiWorkMode
  branchName: string
  repoId: string
}): void {
  // Why: preserve any follow-ups that coalesced while createWorktree was in flight.
  const prior = getIssueAiWorkEntry(args.registryId)
  registerIssueAiWork(args.registryId, {
    worktreeId: args.worktreeId,
    tabId: args.tabId,
    agentLabel: args.agent,
    startedAt: Date.now(),
    mode: args.mode,
    branchName: args.branchName,
    repoId: args.repoId,
    pendingMessages: prior?.pendingMessages?.length ? prior.pendingMessages : [args.prompt],
    attribution:
      prior?.attribution ??
      classifyDirectHuman({
        originatorId: 'local-user',
        evidenceKind: 'launch',
        evidenceRefId: args.registryId
      })
  })
}
