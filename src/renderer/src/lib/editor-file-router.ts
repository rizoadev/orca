import type { Worktree } from '../../../shared/types'

// Why: longest-path-prefix match so a file picked from a subdirectory lands in
// its closest worktree. Used by Ctrl+O to route cross-worktree picks without
// dragging the user through a second picker.
export function findWorktreeContainingPath(
  worktreesByRepo: Record<string, Worktree[]>,
  filePath: string
): Worktree | null {
  const normalized = filePath.replace(/\\/g, '/')
  let best: { worktree: Worktree; length: number } | null = null
  for (const worktrees of Object.values(worktreesByRepo)) {
    for (const worktree of worktrees) {
      const root = worktree.path.replace(/\\/g, '/').replace(/\/$/, '')
      if (normalized === root || normalized.startsWith(`${root}/`)) {
        if (!best || root.length > best.length) {
          best = { worktree, length: root.length }
        }
      }
    }
  }
  return best?.worktree ?? null
}

// Why: compute the relative path used by the editor tab label and Monaco's
// file-tree lookup. Outside the root we fall back to the basename so the tab
// label still resolves; the worktree mismatch is the real signal we toast about.
export function computeRelativePath(worktreePath: string, filePath: string): string {
  const normalizedRoot = worktreePath.replace(/\\/g, '/').replace(/\/$/, '')
  const normalizedFile = filePath.replace(/\\/g, '/')
  if (normalizedFile.startsWith(`${normalizedRoot}/`)) {
    return normalizedFile.slice(normalizedRoot.length + 1)
  }
  const segments = normalizedFile.split('/')
  return segments.at(-1) ?? normalizedFile
}
