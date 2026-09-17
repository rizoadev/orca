/** In-memory mapping: Linear issue title keywords → Orca repo ID. */
import type { Repo } from '../../shared/types'

/** Keywords that map to each repo — lowercased for matching. */
const REPO_ALIASES: { repoId: string; keywords: string[] }[] = [
  { repoId: 'a1e0d236-3995-40be-8753-ecd3927ed85f', keywords: ['barcode', 'aimi-barcode', 'aimi'] },
  { repoId: '61e209b0-e344-472c-8f4f-78fdb9ed344e', keywords: ['orca'] },
  { repoId: '85cb6361-2f2d-47ac-9010-0ff337e6242a', keywords: ['fullstack', 'lm'] },
  { repoId: '3e825d22-4e07-4fb0-b6fe-f1df7e1451b4', keywords: ['ahliwebsite', 'ahli'] },
  { repoId: 'e65ee92a-6240-49a9-8980-6f0fa8f0fd75', keywords: ['pigate', 'pi-gate'] },
  { repoId: 'eaa9ac16-1100-49ef-98cf-94c10d3cad52', keywords: ['prod-plan', 'product plan'] },
  { repoId: '4f910fe3-6944-4733-8fc5-dd9ae86bd31f', keywords: ['lp-agency', 'lp agency'] },
  { repoId: '89d2800b-7ef5-498f-89d1-75b5c3e15157', keywords: ['erpnext', 'erp'] },
  {
    repoId: 'ad171efa-8f12-49da-a905-9d915ea6f3c7',
    keywords: ['selftask', 'job hunt', 'eu remote']
  }
]

/** Fallback repo when no keyword match. */
const DEFAULT_REPO_ID = 'a1e0d236-3995-40be-8753-ecd3927ed85f'

export function resolveRepoIdFromIssue(
  title: string,
  description?: string | null,
  existingRepos?: readonly Repo[]
): string | undefined {
  const text = `${title} ${description ?? ''}`.toLowerCase()

  // First try exact repo name matching from Orca's registry
  if (existingRepos) {
    for (const repo of existingRepos) {
      const name = (repo.displayName ?? repo.path ?? '').toLowerCase()
      if (text.includes(name)) {
        return repo.id
      }
    }
  }

  // Then try keyword aliases
  for (const entry of REPO_ALIASES) {
    for (const keyword of entry.keywords) {
      if (text.includes(keyword)) {
        return entry.repoId
      }
    }
  }

  return undefined
}

export function resolveRepoIdOrDefault(title: string, description?: string | null): string {
  return resolveRepoIdFromIssue(title, description) ?? DEFAULT_REPO_ID
}
