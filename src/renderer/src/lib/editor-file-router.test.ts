import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../../shared/types'
import { computeRelativePath, findWorktreeContainingPath } from './editor-file-router'

function makeWorktree(overrides: Partial<Worktree>): Worktree {
  return {
    id: 'wt-1',
    repoId: 'repo-1',
    displayName: 'wt',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    path: '/repo',
    head: 'abc',
    branch: 'main',
    isBare: false,
    isMainWorktree: true,
    ...overrides
  } as Worktree
}

describe('findWorktreeContainingPath', () => {
  it('matches the longest-prefix worktree', () => {
    const outer = makeWorktree({ id: 'wt-outer', path: '/home/me' })
    const inner = makeWorktree({ id: 'wt-inner', path: '/home/me/projects/app' })
    const byRepo = { 'repo-1': [outer, inner] }
    expect(findWorktreeContainingPath(byRepo, '/home/me/projects/app/src/foo.ts')?.id).toBe(
      'wt-inner'
    )
  })

  it('falls back to the only matching worktree when no longer prefix exists', () => {
    const inner = makeWorktree({ id: 'wt-inner', path: '/home/me/projects/app' })
    const byRepo = { 'repo-1': [inner] }
    expect(findWorktreeContainingPath(byRepo, '/home/me/projects/app/README.md')?.id).toBe(
      'wt-inner'
    )
  })

  it('returns null when the file is outside every worktree', () => {
    const inner = makeWorktree({ id: 'wt-inner', path: '/home/me/projects/app' })
    const byRepo = { 'repo-1': [inner] }
    expect(findWorktreeContainingPath(byRepo, '/etc/hosts')).toBeNull()
  })

  it('treats Windows backslashes the same as forward slashes', () => {
    const wt = makeWorktree({ id: 'wt-win', path: 'C:/code/app' })
    const byRepo = { 'repo-1': [wt] }
    expect(findWorktreeContainingPath(byRepo, 'C:/code/app/src/index.ts')?.id).toBe('wt-win')
    expect(findWorktreeContainingPath(byRepo, 'C:\\code\\app\\src\\index.ts')?.id).toBe('wt-win')
  })

  it('does not match sibling paths with a shared prefix segment', () => {
    const wt = makeWorktree({ id: 'wt', path: '/repo' })
    const byRepo = { 'repo-1': [wt] }
    // Why: a sibling like /repo-other must not register as inside /repo.
    expect(findWorktreeContainingPath(byRepo, '/repo-other/file.ts')).toBeNull()
  })
})

describe('computeRelativePath', () => {
  it('strips the worktree root with a leading separator', () => {
    expect(computeRelativePath('/repo', '/repo/src/foo.ts')).toBe('src/foo.ts')
  })

  it('returns the basename when the file lives outside the root', () => {
    expect(computeRelativePath('/repo', '/elsewhere/foo.ts')).toBe('foo.ts')
  })

  it('normalizes Windows separators', () => {
    expect(computeRelativePath('C:/code/app', 'C:/code/app/src\\index.ts')).toBe('src/index.ts')
  })
})
