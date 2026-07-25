import { describe, expect, it } from 'vitest'
import {
  buildIssueOrchestrationCoalesceKey,
  buildIssueOrchestrationSpec,
  buildIssueOrchestrationTitle
} from './issue-to-orchestration-task'

describe('issue-to-orchestration-task', () => {
  it('builds a stable title and coalesce key', () => {
    expect(
      buildIssueOrchestrationTitle({
        issueNumber: 42,
        title: '  Fix retry loop  ',
        provider: 'github'
      })
    ).toBe('#42 Fix retry loop')
    expect(
      buildIssueOrchestrationCoalesceKey({
        provider: 'github',
        repoId: 'repo_1',
        issueNumber: 42
      })
    ).toBe('issue:github:repo_1:#42')
  })

  it('includes issue url and body in the spec', () => {
    const spec = buildIssueOrchestrationSpec({
      provider: 'github',
      issueNumber: 7,
      title: 'Broken auth',
      url: 'https://github.com/acme/app/issues/7',
      body: 'Users cannot login after rotate.',
      repoId: 'r1'
    })
    expect(spec).toContain('#7')
    expect(spec).toContain('Broken auth')
    expect(spec).toContain('https://github.com/acme/app/issues/7')
    expect(spec).toContain('Users cannot login after rotate.')
  })
})
