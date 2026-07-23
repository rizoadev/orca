import type { GitRemoteIdentity } from '../shared/git-remote-identity'
import type { Repo } from '../shared/types'
import { detectGitRemoteIdentity } from './repo-git-remote-identity'
import { getRepoLocationCacheKey } from './repo-location-cache-key'

export { REPO_LOCATION_CACHE_KEY_MAX_BYTES } from './repo-location-cache-key'

const NO_IDENTITY_RETRY_TTL_MS = 5 * 60 * 1000
export const REPO_IDENTITY_NEGATIVE_CACHE_MAX_ENTRIES = 512
// Why: remotes can switch (GitHub→GitLab) after first enrichment; re-probe on a
// short TTL so Issues/source-control stop following stale provider metadata.
const IDENTITY_REFRESH_TTL_MS = 60 * 1000

type RepoIdentityStore = {
  getRepos(): Repo[]
  getRepo?(id: string): Repo | undefined
  updateRepo(
    id: string,
    updates: Pick<Partial<Repo>, 'gitRemoteIdentity' | 'upstream'>
  ): Repo | null
}

type EnrichmentOptions = {
  onChanged?: () => void
}

const inFlightProbesByLocation = new Map<string, Promise<boolean>>()
const noIdentityRetryAfterByLocation = new Map<string, number>()
const lastSuccessfulProbeAtByLocation = new Map<string, number>()

function pruneNoIdentityRetryCache(now: number): void {
  for (const [locationKey, retryAfter] of noIdentityRetryAfterByLocation) {
    if (retryAfter <= now) {
      noIdentityRetryAfterByLocation.delete(locationKey)
    }
  }
  while (noIdentityRetryAfterByLocation.size > REPO_IDENTITY_NEGATIVE_CACHE_MAX_ENTRIES) {
    const oldestLocation = noIdentityRetryAfterByLocation.keys().next().value
    if (oldestLocation === undefined) {
      break
    }
    noIdentityRetryAfterByLocation.delete(oldestLocation)
  }
}

function rememberNoIdentityRetry(locationKey: string, retryAfter: number): void {
  noIdentityRetryAfterByLocation.delete(locationKey)
  noIdentityRetryAfterByLocation.set(locationKey, retryAfter)
  pruneNoIdentityRetryCache(Date.now())
}

function getCurrentRepo(store: RepoIdentityStore, id: string): Repo | undefined {
  return store.getRepo?.(id) ?? store.getRepos().find((repo) => repo.id === id)
}

function isSameProbeTarget(snapshot: Repo, current: Repo | undefined): boolean {
  return (
    !!current &&
    current.kind !== 'folder' &&
    current.path === snapshot.path &&
    (current.connectionId ?? null) === (snapshot.connectionId ?? null)
  )
}

function sameGitRemoteIdentity(
  left: GitRemoteIdentity | null | undefined,
  right: GitRemoteIdentity | null | undefined
): boolean {
  if (!left && !right) {
    return true
  }
  if (!left || !right) {
    return false
  }
  return (
    left.canonicalKey === right.canonicalKey &&
    left.remoteName === right.remoteName &&
    left.remoteUrl === right.remoteUrl
  )
}

function isGitHubCanonicalKey(canonicalKey: string | null | undefined): boolean {
  const key = canonicalKey?.trim().toLowerCase() ?? ''
  return key.startsWith('github.com/')
}

async function enrichRepoGitRemoteIdentity(store: RepoIdentityStore, repo: Repo): Promise<boolean> {
  const locationKey = getRepoLocationCacheKey(repo)
  const now = Date.now()
  pruneNoIdentityRetryCache(now)
  const retryAfter = locationKey ? (noIdentityRetryAfterByLocation.get(locationKey) ?? 0) : 0
  if (retryAfter > now) {
    return false
  }
  const lastSuccess = locationKey ? (lastSuccessfulProbeAtByLocation.get(locationKey) ?? 0) : 0
  // Why: skip thrashing git remote -v when we already refreshed this path recently
  // and already have an identity — still probe immediately when identity is missing.
  if (
    repo.gitRemoteIdentity &&
    lastSuccess > 0 &&
    Date.now() - lastSuccess < IDENTITY_REFRESH_TTL_MS
  ) {
    return false
  }
  const inFlight = locationKey ? inFlightProbesByLocation.get(locationKey) : undefined
  if (inFlight) {
    return inFlight
  }
  const probe = (async () => {
    const identity = await detectGitRemoteIdentity(repo.path, repo.connectionId)
    if (!identity) {
      // Why: repos without a parseable remote are common; cache misses briefly so
      // list calls stay cheap while still allowing recent remote changes to land.
      if (locationKey) {
        rememberNoIdentityRetry(locationKey, Date.now() + NO_IDENTITY_RETRY_TTL_MS)
      }
      return false
    }

    if (locationKey) {
      noIdentityRetryAfterByLocation.delete(locationKey)
      lastSuccessfulProbeAtByLocation.set(locationKey, Date.now())
    }
    const current = getCurrentRepo(store, repo.id)
    if (!isSameProbeTarget(repo, current) || !current) {
      return false
    }
    const updates: Pick<Partial<Repo>, 'gitRemoteIdentity' | 'upstream'> = {}
    if (!sameGitRemoteIdentity(current.gitRemoteIdentity, identity)) {
      updates.gitRemoteIdentity = identity
    }
    // Why: GitHub-only `upstream` lingered after remotes moved to GitLab and forced
    // Issues onto the GitHub path; clear it when the live remote is not GitHub.
    if (current.upstream && !isGitHubCanonicalKey(identity.canonicalKey)) {
      updates.upstream = null
    }
    if (Object.keys(updates).length === 0) {
      return false
    }
    return !!store.updateRepo(repo.id, updates)
  })().finally(() => {
    if (locationKey && inFlightProbesByLocation.get(locationKey) === probe) {
      inFlightProbesByLocation.delete(locationKey)
    }
  })
  if (locationKey) {
    inFlightProbesByLocation.set(locationKey, probe)
  }
  return probe
}

async function enrichMissingRepoGitRemoteIdentitiesInBackground(
  store: RepoIdentityStore,
  options: EnrichmentOptions
): Promise<void> {
  const candidates = store.getRepos().filter((repo) => repo.kind !== 'folder')
  let changed = false
  for (const repo of candidates) {
    // Why: enrichment runs later; capture the location we probed so a mutable
    // store cannot make the stale-write guard compare against changed fields.
    if (await enrichRepoGitRemoteIdentity(store, { ...repo })) {
      changed = true
    }
  }
  if (changed) {
    options.onChanged?.()
  }
}

export function enrichMissingRepoGitRemoteIdentities(
  store: RepoIdentityStore,
  options: EnrichmentOptions = {}
): void {
  void enrichMissingRepoGitRemoteIdentitiesInBackground(store, options).catch((error: unknown) => {
    console.error('[repo-identity] Failed to enrich git remote identities:', error)
  })
}

export async function flushRepoGitRemoteIdentityEnrichmentForTests(): Promise<void> {
  await Promise.all(inFlightProbesByLocation.values())
}

export function resetRepoGitRemoteIdentityEnrichmentForTests(): void {
  inFlightProbesByLocation.clear()
  noIdentityRetryAfterByLocation.clear()
  lastSuccessfulProbeAtByLocation.clear()
}

export function getRepoGitRemoteIdentityNegativeCacheSizeForTests(): number {
  return noIdentityRetryAfterByLocation.size
}
