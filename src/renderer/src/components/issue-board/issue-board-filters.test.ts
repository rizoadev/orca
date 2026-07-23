import { describe, expect, it } from 'vitest'
import type { GitLabWorkItem } from '../../../../shared/types'
import {
  applyIssueBoardFilter,
  collectLabels,
  EMPTY_ISSUE_BOARD_FILTER
} from './issue-board-filters'

function issue(overrides: Partial<GitLabWorkItem>): GitLabWorkItem {
  return {
    id: 'gitlab-issue-1',
    type: 'issue',
    number: 1,
    title: 'Sample',
    state: 'opened',
    url: 'https://gitlab.com/g/p/-/issues/1',
    labels: [],
    updatedAt: '2026-01-01T00:00:00Z',
    author: null,
    repoId: 'repo-1',
    ...overrides
  }
}

describe('collectLabels', () => {
  it('returns a sorted deduplicated set of labels across issues', () => {
    const labels = collectLabels([
      issue({ labels: ['bug', 'ui'] }),
      issue({ labels: ['ui', 'good-first-issue'] }),
      issue({ labels: [] })
    ])
    expect(labels).toEqual(['bug', 'good-first-issue', 'ui'])
  })
})

describe('applyIssueBoardFilter', () => {
  const rows = [
    issue({ number: 10, title: 'Fix login redirect', labels: ['bug'], author: 'alice' }),
    issue({ number: 11, title: 'Docs typo', labels: ['docs'], author: 'bob' }),
    issue({
      number: 12,
      title: 'Onboarding polish',
      labels: ['ui', 'good-first-issue'],
      author: 'alice'
    })
  ]

  it('returns everything when the filter is empty', () => {
    expect(applyIssueBoardFilter(rows, EMPTY_ISSUE_BOARD_FILTER)).toHaveLength(3)
  })

  it('matches title substring case-insensitively', () => {
    expect(
      applyIssueBoardFilter(rows, { query: 'ONBOARDING', label: '' }).map((r) => r.number)
    ).toEqual([12])
  })

  it('matches label token', () => {
    expect(applyIssueBoardFilter(rows, { query: 'ui', label: '' }).map((r) => r.number)).toEqual([
      12
    ])
  })

  it('matches author login', () => {
    expect(applyIssueBoardFilter(rows, { query: 'bob', label: '' }).map((r) => r.number)).toEqual([
      11
    ])
  })

  it('matches issue number', () => {
    expect(applyIssueBoardFilter(rows, { query: '10', label: '' }).map((r) => r.number)).toEqual([
      10
    ])
  })

  it('narrows further by required label', () => {
    expect(
      applyIssueBoardFilter(rows, { query: '', label: 'good-first-issue' }).map((r) => r.number)
    ).toEqual([12])
  })
})
