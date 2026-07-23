import type { GitLabWorkItem } from '../../../../shared/types'

export type IssueBoardFilterState = {
  /** Free-text search matched against title + labels. Case-insensitive. */
  query: string
  /** Label name to require. Empty string means "any". */
  label: string
}

export const EMPTY_ISSUE_BOARD_FILTER: IssueBoardFilterState = {
  query: '',
  label: ''
}

export function collectLabels(items: readonly GitLabWorkItem[]): string[] {
  const set = new Set<string>()
  for (const item of items) {
    for (const label of item.labels ?? []) {
      if (label) {
        set.add(label)
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function applyIssueBoardFilter(
  items: readonly GitLabWorkItem[],
  filter: IssueBoardFilterState
): GitLabWorkItem[] {
  const q = filter.query.trim().toLowerCase()
  const label = filter.label.trim().toLowerCase()
  return items.filter((item) => {
    if (label) {
      const has = (item.labels ?? []).some((candidate) => candidate.toLowerCase() === label)
      if (!has) {
        return false
      }
    }
    if (q) {
      const titleMatches = item.title.toLowerCase().includes(q)
      const labelMatches = (item.labels ?? []).some((l) => l.toLowerCase().includes(q))
      const authorMatches = item.author ? item.author.toLowerCase().includes(q) : false
      const numberMatches = String(item.number).includes(q)
      if (!titleMatches && !labelMatches && !authorMatches && !numberMatches) {
        return false
      }
    }
    return true
  })
}
