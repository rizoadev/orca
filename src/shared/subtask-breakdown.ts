/** Parse the researcher SUBTASK BREAKDOWN list into draft items. */

export type SubTaskBreakdownItem = {
  title: string
  role: string
  description: string
}

const ITEM_RE = /^\s*(?:\[\d+\]|[-*]|\d+[.)])\s+(.+?)\s*(?:—|-|:)\s*([a-z_]+)\s*(?:—|-|:)\s*(.*)$/i

// Why: the researcher often wraps the breakdown in prose (problem framing,
// VERDICT lines, etc.). Only parse lines inside the SUBTASK BREAKDOWN block
// so framing/verdict text never becomes a checklist item.
// A marker like "**SUBTASK BREAKDOWN:**" — strip emphasis chars, then match.
const BLOCK_START_RE = /^\s*subtask\s+breakdown\s*:?\s*$/i
const BLOCK_END_RE = /^\s*(?:verdict|result|conclusion|done|summary)\b.*$/i

function collectBlockLines(text: string): string[] {
  const lines = text.split('\n')
  let inBlock = false
  let sawMarker = false
  const block: string[] = []
  for (const raw of lines) {
    const line = raw.replace(/[*_`]/g, '').trim()
    if (!inBlock && BLOCK_START_RE.test(line)) {
      inBlock = true
      sawMarker = true
      continue
    }
    if (inBlock && BLOCK_END_RE.test(line)) {
      break
    }
    if (inBlock) {
      block.push(raw)
    }
  }
  // No marker found: fall back to the whole text so plain lists still parse.
  return sawMarker ? block : lines
}

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
  for (const rawLine of collectBlockLines(text)) {
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
