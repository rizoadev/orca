import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/types'
import { detectRepoIssueProvider } from './repo-issue-provider'

function repo(
  partial: Partial<Repo> = {}
): Pick<Repo, 'upstream' | 'repoIcon' | 'gitRemoteIdentity'> {
  return {
    upstream: partial.upstream,
    repoIcon: partial.repoIcon,
    gitRemoteIdentity: partial.gitRemoteIdentity
  }
}

describe('detectRepoIssueProvider', () => {
  it('detects GitHub from upstream owner/repo', () => {
    expect(
      detectRepoIssueProvider(
        repo({
          upstream: { owner: 'stablyai', repo: 'orca' }
        })
      )
    ).toBe('github')
  })

  it('detects GitHub from canonical remote identity', () => {
    expect(
      detectRepoIssueProvider(
        repo({
          gitRemoteIdentity: {
            canonicalKey: 'github.com/stablyai/orca',
            remoteName: 'origin',
            remoteUrl: 'git@github.com:stablyai/orca.git'
          }
        })
      )
    ).toBe('github')
  })

  it('detects GitLab.com from remote identity', () => {
    expect(
      detectRepoIssueProvider(
        repo({
          gitRemoteIdentity: {
            canonicalKey: 'gitlab.com/group/app',
            remoteName: 'origin',
            remoteUrl: 'git@gitlab.com:group/app.git'
          }
        })
      )
    ).toBe('gitlab')
  })

  it('prefers live GitLab remote over stale GitHub upstream metadata', () => {
    expect(
      detectRepoIssueProvider(
        repo({
          upstream: { owner: 'old-org', repo: 'old-app' },
          repoIcon: {
            type: 'image',
            source: 'github',
            label: 'old-org/old-app',
            src: 'https://avatars.githubusercontent.com/u/1'
          },
          gitRemoteIdentity: {
            canonicalKey: 'gitlab.com/group/app',
            remoteName: 'origin',
            remoteUrl: 'git@gitlab.com:group/app.git'
          }
        })
      )
    ).toBe('gitlab')
  })

  it('detects self-hosted GitLab hostnames', () => {
    expect(
      detectRepoIssueProvider(
        repo({
          gitRemoteIdentity: {
            canonicalKey: 'gitlab.company.test/platform/tools',
            remoteName: 'origin',
            remoteUrl: 'git@gitlab.company.test:platform/tools.git'
          }
        })
      )
    ).toBe('gitlab')
  })

  it('detects GitLab from lucide repo icon when remote identity is missing', () => {
    expect(
      detectRepoIssueProvider(
        repo({
          repoIcon: { type: 'lucide', name: 'gitlab' }
        })
      )
    ).toBe('gitlab')
  })

  it('returns null when no GitHub/GitLab identity is available', () => {
    expect(
      detectRepoIssueProvider(
        repo({
          gitRemoteIdentity: {
            canonicalKey: 'git.company.test/team/sample-app',
            remoteName: 'origin',
            remoteUrl: 'git@git.company.test:team/sample-app.git'
          }
        })
      )
    ).toBeNull()
  })
})
