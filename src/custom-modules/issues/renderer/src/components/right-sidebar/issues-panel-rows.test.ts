import { describe, expect, it } from 'vitest'
import type { GitHubWorkItem, GitLabWorkItem } from '../../../../shared/types'
import { toGitHubIssueRows, toGitLabIssueRows } from './issues-panel-rows'

describe('issues-panel-rows', () => {
  it('keeps only GitHub issues from mixed work-item lists', () => {
    const items = [
      {
        id: 'issue-1',
        type: 'issue',
        number: 1,
        title: 'Bug',
        state: 'open',
        url: 'https://github.com/a/b/issues/1',
        labels: [],
        updatedAt: '2026-01-01T00:00:00Z',
        author: null,
        repoId: 'repo-1'
      },
      {
        id: 'pr-2',
        type: 'pr',
        number: 2,
        title: 'PR',
        state: 'open',
        url: 'https://github.com/a/b/pull/2',
        labels: [],
        updatedAt: '2026-01-01T00:00:00Z',
        author: null,
        repoId: 'repo-1'
      }
    ] as GitHubWorkItem[]

    expect(toGitHubIssueRows(items)).toEqual([
      expect.objectContaining({ id: 'issue-1', number: 1, provider: 'github' })
    ])
  })

  it('stamps the renderer repo id on GitLab rows', () => {
    const items = [
      {
        id: 'gitlab-issue-1',
        type: 'issue',
        number: 9,
        title: 'Fix CI',
        state: 'opened',
        url: 'https://gitlab.com/a/b/-/issues/9',
        labels: [],
        updatedAt: '2026-01-01T00:00:00Z',
        author: null,
        repoId: 'stale'
      }
    ] as GitLabWorkItem[]

    expect(toGitLabIssueRows(items, 'repo-42')[0]).toMatchObject({
      provider: 'gitlab',
      number: 9,
      gitlabItem: { repoId: 'repo-42' }
    })
  })
})
