// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { Repo } from '../../../../shared/types'
import { EnvSnippetSyncSection } from './env-snippet-sync-section'

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock
  }
}))

vi.mock('@/components/quick-open-file-list', () => ({
  useRuntimeFileListForWorktree: () => ({
    files: ['.env', 'packages/web/.env.local'],
    loading: false,
    loadError: null
  })
}))

vi.mock('@/store/selectors', () => ({
  useWorktreesForRepo: () => [],
  useActiveWorktree: () => ({ branch: 'refs/heads/main' })
}))

vi.mock('@/lib/git-utils', () => ({
  branchName: (b: string) => (b ? b.replace(/^refs\/heads\//, '') : '')
}))

import type * as PathLib from '@/lib/path'

vi.mock('@/lib/path', async (importOriginal) => {
  const actual = await importOriginal<typeof PathLib>()
  return {
    ...actual,
    basename: (p: string) => {
      const parts = p.split(/[\\/]/)
      return parts.at(-1) ?? ''
    }
  }
})

const gitlabRepo: Repo = {
  id: 'repo-1',
  path: '/tmp/project',
  displayName: 'project',
  upstream: 'git@gitlab.com:group/project.git',
  gitRemoteIdentity: {
    canonicalKey: 'gitlab.com:group/project.git',
    remoteUrl: 'git@gitlab.com:group/project.git',
    normalizedPath: 'group/project'
  },
  repoIcon: { type: 'lucide', name: 'gitlab' },
  worktreeIds: [],
  isFolder: false
} as unknown as Repo

function setWindowApi(api: unknown): void {
  ;(globalThis as unknown as { window: { api: unknown } }).window = { api }
}

describe('EnvSnippetSyncSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()
  })

  it('renders the collapsible header and env rows for a GitLab repo', () => {
    setWindowApi({
      gl: {
        listProjectSnippets: vi.fn().mockResolvedValue({ items: [], error: null })
      }
    })
    render(
      <EnvSnippetSyncSection
        worktreePath="/tmp/project"
        activeWorktreeId="worktree-1"
        connectionId={null}
        repo={gitlabRepo}
        isVisible
      />
    )
    expect(screen.getByText('.env Snippets')).toBeTruthy()
  })

  it('renders a Requires-GitLab hint for a non-GitLab repo', () => {
    setWindowApi({})
    const githubRepo: Repo = {
      ...gitlabRepo,
      upstream: 'git@github.com:group/project.git',
      gitRemoteIdentity: {
        canonicalKey: 'github.com:group/project.git',
        remoteUrl: 'git@github.com:group/project.git',
        normalizedPath: 'group/project'
      },
      repoIcon: { type: 'lucide', name: 'github' }
    } as unknown as Repo
    render(
      <EnvSnippetSyncSection
        worktreePath="/tmp/project"
        activeWorktreeId="worktree-1"
        connectionId={null}
        repo={githubRepo}
        isVisible
      />
    )
    expect(screen.getByText('.env Snippets')).toBeTruthy()
  })
})
