/** Parse the researcher SUBTASK BREAKDOWN list into draft items. */

export type SubTaskBreakdownItem = {
  title: string
  role: string
  description: string
}

const ITEM_RE = /^\s*(?:\[\d+\]|[-*]|\d+[.)])\s+(.+?)\s*(?:—|-|:)\s*([a-z_]+)\s*(?:—|-|:)\s*(.*)$/i

/**
 * Extract items from a research worker_done body. Accepts lines like:
 *   [1] Add auth — implement — wire JWT middleware
 *   - Write tests — test — cover login flow
 * Falls back to non-empty bullet lines when the role delimiter is missing.
 */
export function parseSubtaskBreakdown(text: string | null | undefined): SubTaskBreakdownItem[] {
  if (!text) {
    return []
  }
  const items: SubTaskBreakdownItem[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    const match = line.match(ITEM_RE)
    if (match) {
      items.push({
        title: match[1]!.trim(),
        role: match[2]!.trim().toLowerCase(),
        description: (match[3] ?? '').trim()
      })
      continue
    }
    // Fallback: a plain bullet without role delimiters becomes an implement item.
    const bullet = line.replace(/^(?:\[\d+\]|[-*]|\d+[.)])\s*/, '').trim()
    if (bullet && bullet.length > 2) {
      items.push({ title: bullet, role: 'implement', description: '' })
    }
  }
  return items
}
