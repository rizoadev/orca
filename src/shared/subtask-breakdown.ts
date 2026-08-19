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
 * Extract items from a research worker_done body. Prefers a JSON array
 * (new researcher output), then falls back to the SUBTASK BREAKDOWN list.
 *   JSON:   [{"title": "Add auth", "role": "implement", "description": "..."}]
 *   List:   [1] Add auth — implement — wire JWT middleware
 *           - Write tests — test — cover login flow
 */
export function parseSubtaskBreakdown(text: string | null | undefined): SubTaskBreakdownItem[] {
  if (!text) {
    return []
  }
  const jsonItems = parseJsonArray(text)
  if (jsonItems.length > 0) {
    return jsonItems
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
    // Fallback: only lines that start with a real bullet marker become items.
    // Prose, role-only words and verdict lines must never leak into the list.
    const bullet = line.match(/^(?:\[\d+\]|[-*]|\d+[.)])\s+(.+)$/)
    const bulletText = bullet?.[1]?.trim()
    if (bulletText && bulletText.length > 2) {
      items.push({ title: bulletText, role: 'implement', description: '' })
    }
  }
  return items
}

/** Try to extract a subtask JSON array from the text (fences or bare). */
function parseJsonArray(text: string): SubTaskBreakdownItem[] {
  // Why: the model may wrap JSON in ```json fences, or put prose around it —
  // grab the first [ ... ] span and try to decode it.
  const candidates: string[] = []
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    candidates.push(fenced[1])
  }
  const bare = text.match(/\[[\s\S]*?\]/)
  if (bare?.[0]) {
    candidates.push(bare[0])
  }
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (Array.isArray(parsed)) {
        const items = parsed
          .filter(
            (raw): raw is Record<string, unknown> =>
              typeof raw === 'object' &&
              raw !== null &&
              typeof (raw as Record<string, unknown>).title === 'string'
          )
          .map((raw) => ({
            title: String(raw.title).trim(),
            role:
              typeof raw.role === 'string' && raw.role.trim()
                ? raw.role.trim().toLowerCase()
                : 'implement',
            description: typeof raw.description === 'string' ? raw.description.trim() : ''
          }))
        if (items.length > 0) {
          return items
        }
      }
    } catch {
      // try the next candidate
    }
  }
  return []
}
