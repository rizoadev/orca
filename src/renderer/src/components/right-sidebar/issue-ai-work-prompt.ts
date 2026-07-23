import type { RepoIssueProvider } from './repo-issue-provider'

// Why: local shape only — avoid circular import with issues-panel-ai-work.ts.
type IssueWorkFocusComment = {
  author: string
  body: string
  createdAt?: string
  path?: string
  line?: number
}

// Why: keep the sentinel identical to what the prompt asks the agent to emit —
// downstream automations may key completion notifications off this line.
export const ISSUE_WORK_COMPLETION_SENTINEL = 'ORCA_ISSUE_WORK_DONE'

function slugifyBranchLeaf(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned.slice(0, 40) || 'issue'
}

export function buildIssueBranchName(number: number, title: string): string {
  return `fix/issue-${number}-${slugifyBranchLeaf(title)}`
}

export function buildIssueAiWorkPrompt(args: {
  provider: RepoIssueProvider
  number: number
  title: string
  url: string
  body?: string
  repoDisplayName?: string
  branchName: string
  completionSentinel: string
  baseBranch?: string
  focusComment?: IssueWorkFocusComment
}): string {
  const providerLabel = args.provider === 'github' ? 'GitHub' : 'GitLab'
  const commentCommand =
    args.provider === 'github'
      ? `gh issue comment ${args.number} --body "..."`
      : `glab issue note ${args.number} --message "..."`
  const body = args.body?.trim()
  const focus = args.focusComment
  const focusBody = focus?.body?.trim()
  const focusLoc =
    focus?.path != null
      ? `${focus.path}${typeof focus.line === 'number' ? `:${focus.line}` : ''}`
      : null

  return [
    focus
      ? `You are working autonomously on ${providerLabel} issue #${args.number}, prioritizing one discussion thread.`
      : `You are working autonomously on ${providerLabel} issue #${args.number}.`,
    args.repoDisplayName ? `Repository: ${args.repoDisplayName}` : null,
    `Issue: ${args.title}`,
    `URL: ${args.url}`,
    `This is a fresh git worktree already checked out on branch \`${args.branchName}\`${
      args.baseBranch ? ` (based on ${args.baseBranch})` : ''
    }. Do NOT switch branches or create another branch — stay on this one.`,
    body ? `Issue body:\n${body}` : 'Issue body: (empty)',
    focus
      ? [
          '',
          'Focus thread comment (highest priority):',
          `Author: @${focus.author}`,
          focusLoc ? `Location: ${focusLoc}` : null,
          focus.createdAt ? `When: ${focus.createdAt}` : null,
          focusBody ? `Comment:\n${focusBody}` : 'Comment: (empty)',
          'Address this thread first; if the broader issue remains after that, keep changes minimal.'
        ]
          .filter((line): line is string => line !== null)
          .join('\n')
      : null,
    '',
    'Autonomy contract:',
    focus
      ? '1. Read the focused thread + issue, then inspect the code paths that need to change in this worktree.'
      : '1. Read the issue, then inspect the code paths that need to change in this worktree.',
    '2. Implement the smallest correct fix. Match existing style. Do not refactor unrelated code.',
    '3. Run the fastest relevant tests/lint that already exist in the repo. Skip long suites.',
    '4. Commit your changes locally with a message like:',
    `   fix(#${args.number}): <short summary>`,
    '5. Do NOT push the branch. Do NOT open a PR/MR. The human will review and decide (open a PR/MR, or discard).',
    `6. Post ONE final comment on the issue summarizing what you did using: ${commentCommand}`,
    '   The comment must include:',
    `   - branch name (${args.branchName})`,
    '   - short summary of the change',
    '   - files touched (bullet list)',
    '   - test/lint results (or "not run" with reason)',
    '   - any follow-ups the human should verify',
    `7. When everything above is finished, print the exact line "${args.completionSentinel} #${args.number}" as the very last line of output, then exit.`,
    '',
    'Guardrails:',
    '- Never force-push, never delete branches, never rewrite shared history.',
    '- Never run destructive shell commands outside this worktree.',
    '- If the issue is unclear or requires product decisions, post a comment asking for clarification instead of guessing, then still emit the completion sentinel.',
    '- If you cannot make progress, still post a comment explaining what you tried and why it is blocked, then emit the completion sentinel.'
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

export function issueAiWorkRegistryKey(
  provider: RepoIssueProvider,
  repoId: string,
  number: number
): string {
  return `${provider}:${repoId}:${number}`
}
