import { isGitHubBackedRepo } from '../../../../shared/project-host-setup-projection'
import type { Repo } from '../../../../shared/types'

export type RepoIssueProvider = 'github' | 'gitlab'

// Why: self-hosted GitLab remotes may not be in glab's known-host list yet, but
// hostname heuristics still let the Issues tab prefer the GitLab list path over
// a dead GitHub fetch for the same remote.
const GITLAB_HOST_HINT_RE = /(?:^|\.)gitlab(?:[.-]|$)/i

function hostFromCanonicalKey(canonicalKey: string | null | undefined): string | null {
  const trimmed = canonicalKey?.trim()
  if (!trimmed) {
    return null
  }
  const host = trimmed.split('/')[0]?.trim()
  return host || null
}

function hostFromRemoteUrl(remoteUrl: string | null | undefined): string | null {
  const trimmed = remoteUrl?.trim()
  if (!trimmed) {
    return null
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    const scpLike = trimmed.match(/^(?:[^@/:]+@)?([^:\s/]+):/)
    return scpLike?.[1]?.trim().toLowerCase() || null
  }
  try {
    return new URL(trimmed).hostname.toLowerCase() || null
  } catch {
    return null
  }
}

function looksLikeGitLabHost(host: string | null | undefined): boolean {
  if (!host) {
    return false
  }
  return host === 'gitlab.com' || GITLAB_HOST_HINT_RE.test(host)
}

export function detectRepoIssueProvider(
  repo: Pick<Repo, 'upstream' | 'repoIcon' | 'gitRemoteIdentity'> | null | undefined
): RepoIssueProvider | null {
  if (!repo) {
    return null
  }
  const host =
    hostFromCanonicalKey(repo.gitRemoteIdentity?.canonicalKey) ??
    hostFromRemoteUrl(repo.gitRemoteIdentity?.remoteUrl)
  // Why: live git remote wins over persisted GitHub `upstream`/avatar metadata.
  // Repos that moved from GitHub→GitLab keep stale upstream and used to misroute
  // the Issues tab to GitHub (empty list / wrong public issues).
  if (looksLikeGitLabHost(host)) {
    return 'gitlab'
  }
  if (host === 'github.com') {
    return 'github'
  }
  if (repo.repoIcon?.type === 'lucide' && repo.repoIcon.name === 'gitlab') {
    return 'gitlab'
  }
  // Why: only fall back to projected GitHub identity when the remote host is
  // unknown — never override a non-GitHub remote just because upstream lingered.
  if (!host && isGitHubBackedRepo(repo)) {
    return 'github'
  }
  return null
}
