/**
 * Convert a GitHub/GitLab issue into an orchestration task scoped to the repo/worktree.
 */
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { OrchestrationBoardTask } from '@/components/orchestration-board/orchestration-board-model'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }

export type IssueToOrchestrationInput = {
  provider: 'github' | 'gitlab' | string
  issueNumber: number
  title: string
  url?: string | null
  body?: string | null
  repoId: string
  worktreeId?: string | null
  hostId?: string | null
  projectId?: string | null
  /** Extra operator notes appended to the spec. */
  notes?: string | null
  priority?: 'low' | 'medium' | 'high' | 'urgent'
}

export type IssueToOrchestrationResult = {
  task: OrchestrationBoardTask
  coalesced?: boolean
}

export function buildIssueOrchestrationSpec(input: IssueToOrchestrationInput): string {
  const lines = [
    `Implement Git ${input.provider} issue #${input.issueNumber}: ${input.title.trim()}`,
    input.url ? `Issue URL: ${input.url}` : null,
    '',
    'Requirements:',
    '- Read the issue and related code before changing anything.',
    '- Keep the fix scoped to this issue; avoid drive-by refactors.',
    '- Add/adjust tests when behavior changes.',
    '- Summarize what you changed when done.',
    input.body?.trim()
      ? ['', 'Issue body:', input.body.trim().slice(0, 4000)].join('\n')
      : null,
    input.notes?.trim() ? ['', 'Operator notes:', input.notes.trim()].join('\n') : null
  ]
  return lines.filter((line) => line !== null).join('\n')
}

export function buildIssueOrchestrationTitle(input: Pick<
  IssueToOrchestrationInput,
  'issueNumber' | 'title' | 'provider'
>): string {
  const title = input.title.replace(/\s+/g, ' ').trim()
  const short = title.length > 80 ? `${title.slice(0, 77)}…` : title
  return `#${input.issueNumber} ${short}`
}

/** Stable coalesce key so double-clicks don't spawn sibling tasks. */
export function buildIssueOrchestrationCoalesceKey(input: {
  provider: string
  repoId: string
  issueNumber: number
}): string {
  return `issue:${input.provider}:${input.repoId}:#${input.issueNumber}`
}

export async function createOrchestrationTaskFromIssue(
  input: IssueToOrchestrationInput
): Promise<IssueToOrchestrationResult> {
  if (!input.repoId) {
    throw new Error('repoId is required to create an orchestration task from an issue')
  }
  const title = buildIssueOrchestrationTitle(input)
  const spec = buildIssueOrchestrationSpec(input)
  const result = await callRuntimeRpc<IssueToOrchestrationResult>(
    LOCAL_RUNTIME_TARGET,
    'orchestration.taskCreate',
    {
      spec,
      taskTitle: title,
      displayName: title,
      coalesceKey: buildIssueOrchestrationCoalesceKey(input),
      priority: input.priority ?? 'medium',
      repoId: input.repoId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
      hostId: input.hostId ?? 'local'
    },
    { timeoutMs: 20_000, skipCompatibilityCheck: true }
  )
  return result
}
