/**
 * S3 object-key prefix per project: {provider}/{owner}/{repo}/{branch}/.
 * Derived from the repo's live git remote so uploads land in a per-project
 * directory and the explorer browser can list exactly that subtree.
 */
import type { Repo } from '../../../../shared/types'
import { detectRepoIssueProvider } from './repo-issue-provider'

export type S3ProjectParts = {
  provider: string
  owner: string
  repo: string
  branch: string
}

export type S3RepoIdentity = {
  provider: string
  owner: string
  repo: string
}

function repoIdentityFromKey(key: string | null | undefined): S3RepoIdentity | null {
  const trimmed = key?.trim()
  if (!trimmed) {
    return null
  }
  const segments = trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
  if (segments.length < 3) {
    return null
  }
  const host = segments[0] ?? ''
  const repoName = segments.at(-1) ?? ''
  const owner = segments.slice(1, -1).join('/')
  if (!host || !owner || !repoName) {
    return null
  }
  const provider =
    detectRepoIssueProvider({
      gitRemoteIdentity: { canonicalKey: trimmed, remoteName: '', remoteUrl: '' },
      repoIcon: undefined,
      upstream: undefined
    }) ?? (host === 'github.com' ? 'github' : host === 'gitlab.com' ? 'gitlab' : host)
  return { provider, owner, repo: repoName }
}

/** Parse host/owner[/nested…]/repo out of the canonical remote key. */
export function parseS3ProjectParts(
  repo: Pick<Repo, 'gitRemoteIdentity' | 'repoIcon' | 'upstream'> | null | undefined,
  branch: string
): S3ProjectParts | null {
  const key = repo?.gitRemoteIdentity?.canonicalKey?.trim()
  if (!key) {
    return null
  }
  const identity = repoIdentityFromKey(key)
  if (!identity) {
    return null
  }
  return { ...identity, branch: branchNameSafe(branch) }
}

/** Resolve repo identity from a live Repo record (used for the filter list). */
export function repoIdentityFromRepo(
  repo: Pick<Repo, 'gitRemoteIdentity' | 'repoIcon' | 'upstream'> | null | undefined
): S3RepoIdentity | null {
  return repoIdentityFromKey(repo?.gitRemoteIdentity?.canonicalKey?.trim())
}

export function s3RepoPrefix(identity: S3RepoIdentity): string {
  return `${S3_ROOT_PREFIX}/${identity.provider}/${identity.owner}/${identity.repo}/`
}

function branchNameSafe(branch: string): string {
  return branch.replace(/^refs\/heads\//, '').replace(/[^\w.-]+/g, '-') || 'unknown'
}

// Why: keep every upload under a single root namespace (orca-ide/) so the
// bucket stays tidy even when multiple Orca installs/users share it.
const S3_ROOT_PREFIX = 'orca-ide'

export function s3ProjectPrefix(parts: S3ProjectParts): string {
  return `${S3_ROOT_PREFIX}/${parts.provider}/${parts.owner}/${parts.repo}/${parts.branch}/`
}

export function s3UploadObjectKey(parts: S3ProjectParts, relativePath: string): string {
  return `${s3ProjectPrefix(parts)}${relativePath.replace(/^\/+/, '')}`
}

/** Strip the project prefix from a listed key → path relative to the worktree. */
export function relativePathFromS3Key(prefix: string, key: string): string {
  return key.startsWith(prefix) ? key.slice(prefix.length) : key
}
