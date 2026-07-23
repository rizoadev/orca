import { describe, expect, it } from 'vitest'
import {
  ISSUE_WORK_COMPLETION_SENTINEL,
  buildIssueAiWorkPrompt,
  buildIssueBranchName
} from './issues-panel-ai-work'

describe('buildIssueBranchName', () => {
  it('slugifies the issue title into a fix/issue-N-... branch', () => {
    expect(buildIssueBranchName(42, 'Fix Login Redirect!')).toBe('fix/issue-42-fix-login-redirect')
  })

  it('trims long titles and collapses non-alphanumerics', () => {
    const branch = buildIssueBranchName(
      7,
      'A very long title with lots of separators / and punctuation — indeed'
    )
    expect(branch.startsWith('fix/issue-7-')).toBe(true)
    // Leaf capped to 40 chars — total = "fix/issue-7-" + <=40 = <=52.
    expect(branch.length).toBeLessThanOrEqual('fix/issue-7-'.length + 40)
    expect(branch).not.toMatch(/[^a-z0-9/-]/)
  })

  it('falls back to "issue" when the title has no usable characters', () => {
    expect(buildIssueBranchName(9, '——')).toBe('fix/issue-9-issue')
  })
})

describe('buildIssueAiWorkPrompt', () => {
  it('produces a GitHub prompt that requires a single final comment and the sentinel', () => {
    const prompt = buildIssueAiWorkPrompt({
      provider: 'github',
      number: 101,
      title: 'Broken avatar on GHE',
      url: 'https://github.example.com/acme/app/issues/101',
      body: 'Repro: open profile.',
      repoDisplayName: 'acme/app',
      branchName: 'fix/issue-101-broken-avatar-on-ghe',
      completionSentinel: ISSUE_WORK_COMPLETION_SENTINEL
    })
    expect(prompt).toContain('GitHub issue #101')
    expect(prompt).toContain('Repository: acme/app')
    expect(prompt).toContain('gh issue comment 101 --body')
    expect(prompt).toContain('branch `fix/issue-101-broken-avatar-on-ghe`')
    expect(prompt).toContain('Do NOT switch branches')
    expect(prompt).toContain('Do NOT push the branch')
    expect(prompt).toContain(`${ISSUE_WORK_COMPLETION_SENTINEL} #101`)
  })

  it('switches the comment tool for GitLab issues', () => {
    const prompt = buildIssueAiWorkPrompt({
      provider: 'gitlab',
      number: 12,
      title: 'CI flaky',
      url: 'https://gitlab.com/group/app/-/issues/12',
      branchName: 'fix/issue-12-ci-flaky',
      completionSentinel: ISSUE_WORK_COMPLETION_SENTINEL
    })
    expect(prompt).toContain('GitLab issue #12')
    expect(prompt).toContain('glab issue note 12 --message')
    expect(prompt).not.toContain('gh issue comment')
    // Empty body still surfaces explicitly so the agent knows the payload was empty.
    expect(prompt).toContain('Issue body: (empty)')
  })
})
