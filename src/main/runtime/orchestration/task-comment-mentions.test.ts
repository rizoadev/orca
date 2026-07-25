import { describe, expect, it } from 'vitest'
import {
  buildOperatorFollowUpPrompt,
  parseCommentMentions
} from './task-comment-mentions'

describe('parseCommentMentions', () => {
  it('parses handle, squad, and role mentions', () => {
    const mentions = parseCommentMentions(
      'Hey @term_worker and @squad:backend please fix; also @role:tester'
    )
    expect(mentions).toEqual([
      { kind: 'handle', value: 'term_worker' },
      { kind: 'squad', value: 'backend' },
      { kind: 'role', value: 'tester' }
    ])
  })

  it('dedupes case-insensitively', () => {
    expect(parseCommentMentions('@Term_A @term_a')).toEqual([
      { kind: 'handle', value: 'Term_A' }
    ])
  })

  it('supports squad/ slash form', () => {
    expect(parseCommentMentions('ping @squad/frontend')).toEqual([
      { kind: 'squad', value: 'frontend' }
    ])
  })
})

describe('buildOperatorFollowUpPrompt', () => {
  it('includes comment and task id', () => {
    const text = buildOperatorFollowUpPrompt({
      taskId: 'task_1',
      commentBody: 'Please also cover retries',
      author: 'operator',
      taskSpec: 'Build X',
      role: 'implementer',
      dispatchId: 'ctx_1'
    })
    expect(text).toContain('task_1')
    expect(text).toContain('Please also cover retries')
    expect(text).toContain('implementer')
    expect(text).toContain('ctx_1')
  })
})
