import { describe, expect, it } from 'vitest'
import { buildIssueAiPlanPrompt } from './issues-panel-ai-plan'

describe('buildIssueAiPlanPrompt', () => {
  it('asks the agent to comment via gh for GitHub issues', () => {
    const prompt = buildIssueAiPlanPrompt({
      provider: 'github',
      number: 42,
      title: 'Fix flaky tests',
      url: 'https://github.com/acme/app/issues/42',
      body: 'Tests flake in CI'
    })
    expect(prompt).toContain('issue #42')
    expect(prompt).toContain('Fix flaky tests')
    expect(prompt).toContain('gh issue comment 42')
    expect(prompt).toContain('Do not implement the fix yet')
  })

  it('asks the agent to comment via glab for GitLab issues', () => {
    const prompt = buildIssueAiPlanPrompt({
      provider: 'gitlab',
      number: 9,
      title: 'Broken pipeline',
      url: 'https://gitlab.com/acme/app/-/issues/9'
    })
    expect(prompt).toContain('glab issue note 9')
    expect(prompt).toContain('Broken pipeline')
  })
})
