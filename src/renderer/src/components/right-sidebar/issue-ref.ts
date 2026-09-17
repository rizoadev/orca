import type { RepoIssueProvider } from './repo-issue-provider'

/**
 * Provider-agnostic issue reference used by AI plan/work flows.
 *
 * Why: GitHub/GitLab address issues by number (`#12`) while Linear uses a
 * team-prefixed key (`ENG-123`). Carrying both lets the shared prompt/branch/
 * registry helpers stay provider-neutral instead of branching per call site.
 */
export type IssueRef = {
  provider: RepoIssueProvider
  /** Numeric provider number for github/gitlab; null for Linear. */
  number: number | null
  /** Linear identifier (ENG-123); undefined for github/gitlab. */
  identifier?: string | null
}

/** Human display key: `ENG-123` when present, else `#12`, else `issue`. */
export function issueRefLabel(ref: Pick<IssueRef, 'number' | 'identifier'>): string {
  const identifier = ref.identifier?.trim()
  if (identifier) {
    return identifier
  }
  return ref.number != null ? `#${ref.number}` : 'issue'
}

/** Slug-safe key used in branch names and the AI-work registry. */
export function issueRefSlug(ref: Pick<IssueRef, 'number' | 'identifier'>): string {
  const identifier = ref.identifier?.trim()
  if (identifier) {
    return identifier.toLowerCase()
  }
  return ref.number != null ? String(ref.number) : 'issue'
}

export function issueRefFromRow(row: {
  provider: RepoIssueProvider
  number: number | null
  label: string
}): IssueRef {
  return {
    provider: row.provider,
    number: row.number,
    identifier: row.provider === 'linear' ? row.label : undefined
  }
}
