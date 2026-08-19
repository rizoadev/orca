// Why: the Explorer tree needs to know which paths currently have a GitLab
// snippet so it can render a per-file marker, while the .env Snippets section
// owns fetching/deleting those snippets. Rather than duplicating fetch logic in
// two components (or wiring them through props), keep a tiny module-level
// pub/sub of synced relative paths keyed by worktree+branch. The section
// publishes on load/upload/delete and the Explorer subscribes.
import { relativePathFromSnippetTitle } from './env-snippet-sync-encoding'
import type { GitLabSnippet } from '../../../../shared/types'

export type SnippetSyncKey = string

function makeKey(worktreePath: string, branch: string | null): SnippetSyncKey {
  return `${worktreePath}\u0000${branch ?? ''}`
}

const syncedPaths = new Map<SnippetSyncKey, Set<string>>()
const listeners = new Set<(key: SnippetSyncKey) => void>()

export function publishSyncedSnippets(
  worktreePath: string,
  branch: string | null,
  snippets: GitLabSnippet[]
): void {
  const key = makeKey(worktreePath, branch)
  const next = new Set<string>()
  for (const snippet of snippets) {
    const rel = relativePathFromSnippetTitle(snippet.title)
    if (rel) {
      next.add(rel)
    }
  }
  syncedPaths.set(key, next)
  for (const listener of listeners) {
    listener(key)
  }
}

export function clearSyncedSnippets(worktreePath: string, branch: string | null): void {
  const key = makeKey(worktreePath, branch)
  if (syncedPaths.delete(key)) {
    for (const listener of listeners) {
      listener(key)
    }
  }
}

export function getSyncedSnippetPaths(
  worktreePath: string,
  branch: string | null
): ReadonlySet<string> {
  return syncedPaths.get(makeKey(worktreePath, branch)) ?? new Set<string>()
}

export function subscribeSyncedSnippets(listener: (key: SnippetSyncKey) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetSyncedSnippetStoreForTests(): void {
  syncedPaths.clear()
  listeners.clear()
}
