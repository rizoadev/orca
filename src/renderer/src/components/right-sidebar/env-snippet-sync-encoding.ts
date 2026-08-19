export const ORCA_SYNC_TITLE_PREFIX = 'orca-sync:'
// Why: keep decoding the legacy 'env:' title prefix so snippets created by the
// earlier .env-only version still resolve to their original path on restore.
export const LEGACY_ENV_TITLE_PREFIX = 'env:'
export const SNIPPET_VISIBILITY = 'private' as const

export function isEnvFileName(name: string): boolean {
  return name === '.env' || name.startsWith('.env.')
}

/** Encode the snippet title as `<branch>:<relativePath>` (e.g. `main:.envs/local.toml`). */
export function snippetTitle(branch: string, relativePath: string): string {
  return `${ORCA_SYNC_TITLE_PREFIX}${branch}:${relativePath}`
}

/** Decode `branch` + `relativePath` from a title produced by `snippetTitle`. */
export function parseSnippetTitle(title: string): { branch: string; relativePath: string } | null {
  const trimmed = title.trim()
  if (trimmed.startsWith(LEGACY_ENV_TITLE_PREFIX)) {
    // Legacy env-only format `env: <relativePath>` — no branch marker.
    const rel = trimmed.slice(LEGACY_ENV_TITLE_PREFIX.length).trim()
    return rel ? { branch: '', relativePath: rel } : null
  }
  if (!trimmed.startsWith(ORCA_SYNC_TITLE_PREFIX)) {
    return null
  }
  const rest = trimmed.slice(ORCA_SYNC_TITLE_PREFIX.length)
  const colonIndex = rest.indexOf(':')
  if (colonIndex === -1) {
    // No branch marker: whole remainder is the path.
    return rest ? { branch: '', relativePath: rest } : null
  }
  const branch = rest.slice(0, colonIndex)
  const relativePath = rest.slice(colonIndex + 1)
  if (!relativePath) {
    return null
  }
  return { branch, relativePath }
}

/** Alias for the common lookup: parse the relativePath from a snippet title. */
export function relativePathFromSnippetTitle(title: string): string | null {
  return parseSnippetTitle(title)?.relativePath ?? null
}

/** True when the snippet belongs to the active branch (branch '' means no branch marker → compatible). */
export function snippetMatchesBranch(branchMarker: string, activeBranch: string | null): boolean {
  if (!branchMarker) {
    return true
  }
  if (!activeBranch) {
    return false
  }
  return branchMarker === activeBranch
}

export function encodeSnippetFileName(relativePath: string): string {
  // Why: GitLab snippet fileName cannot contain slashes; encode nested paths
  // with double-underscore so the panel can later decode them for display.
  return relativePath.replace(/\//g, '__')
}
