/**
 * Autopilot: fold residual agent TODOs / idle handoffs back into the manager loop.
 */

export type ExtractedTodoList = {
  todos: string[]
  /** True when agent signaled it stopped and is waiting (e.g. "Now idle"). */
  idleHandoff: boolean
  /** Raw excerpt used for manager context. */
  excerpt: string
}

const IDLE_RE = /\b(now idle|i'?m idle|going idle|idle\.|waiting for (operator|you|human))\b/i
const TODO_HEADER_RE =
  /\b(before go-?live|operator needs? to|remaining todos?|open todos?|todos?:|todo list|action items?|follow-?ups?)\b/i
const NUMBERED_ITEM_RE = /^\s*(?:\d+[).\]]|-|\*)\s+(.+?)\s*$/

/** Pull residual TODO / operator action items from agent worker_done bodies. */
export function extractOpenTodosFromAgentOutput(text: string | null | undefined): ExtractedTodoList {
  if (!text?.trim()) {
    return { todos: [], idleHandoff: false, excerpt: '' }
  }
  const idleHandoff = IDLE_RE.test(text)
  const lines = text.split(/\r?\n/)
  const todos: string[] = []
  let inTodoBlock = false

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (inTodoBlock && todos.length > 0) {
        // blank line ends a tight list only if we already collected items
        inTodoBlock = false
      }
      continue
    }
    if (TODO_HEADER_RE.test(line) || /^todos?\s*:/i.test(line)) {
      inTodoBlock = true
      continue
    }
    const numbered = line.match(NUMBERED_ITEM_RE)
    if (numbered?.[1] && (inTodoBlock || idleHandoff || todos.length > 0)) {
      const item = numbered[1].replace(/\s+/g, ' ').trim()
      if (item.length >= 3 && !/^verdict\b/i.test(item)) {
        todos.push(item)
        inTodoBlock = true
      }
      continue
    }
    // Single-line "TODO: foo"
    const inline = line.match(/^TODO\s*[:-]\s*(.+)$/i)
    if (inline?.[1]) {
      todos.push(inline[1].replace(/\s+/g, ' ').trim())
    }
  }

  // Dedup preserve order
  const seen = new Set<string>()
  const unique = todos.filter((t) => {
    const key = t.toLowerCase()
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })

  const excerpt = unique.length
    ? unique.map((t, i) => `${i + 1}. ${t}`).join('\n')
    : text.trim().slice(0, 800)

  return { todos: unique, idleHandoff, excerpt }
}

export function shouldAutopilotContinue(input: {
  autopilotEnabled: boolean
  extracted: ExtractedTodoList
  stage?: string | null
}): boolean {
  if (!input.autopilotEnabled) {
    return false
  }
  if (input.extracted.todos.length > 0) {
    return true
  }
  // Idle handoff without structured todos still deserves a manager pass on implement/review.
  if (input.extracted.idleHandoff) {
    return input.stage === 'implement' || input.stage === 'review' || input.stage === 'manage'
  }
  return false
}

export function parseRootAutopilotFlag(result: string | null | undefined): boolean {
  if (!result) {
    return false
  }
  try {
    const parsed = JSON.parse(result) as { autopilot?: unknown }
    return parsed.autopilot === true
  } catch {
    return false
  }
}

export function withRootAutopilotFlag(
  result: string | null | undefined,
  enabled: boolean,
  goal?: string
): string {
  let base: Record<string, unknown> = {
    kind: 'product_pipeline_root',
    ...(goal ? { goal } : {})
  }
  if (result) {
    try {
      const parsed = JSON.parse(result) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') {
        base = { ...base, ...parsed }
      }
    } catch {
      base = { ...base, priorResult: result }
    }
  }
  base.autopilot = enabled
  return JSON.stringify(base)
}

export function buildManagerAutopilotSpec(input: {
  productGoal: string
  attempt: number
  todos: string[]
  sourceStage: string
  sourceSummary: string
}): string {
  const todoBlock =
    input.todos.length > 0
      ? input.todos.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : '(No structured TODO list — triage the idle handoff summary below.)'

  return [
    `You are the MANAGER on AUTOPILOT iteration ${input.attempt}.`,
    'The operator enabled fully autopilot. Do NOT wait for the human unless something is truly impossible without secrets/credentials.',
    '',
    '=== PRODUCT GOAL ===',
    input.productGoal.trim(),
    '',
    `=== RESIDUAL WORK FROM ${input.sourceStage.toUpperCase()} ===`,
    todoBlock,
    '',
    '=== SOURCE SUMMARY ===',
    input.sourceSummary.trim().slice(0, 2000),
    '',
    '=== YOUR JOB ===',
    '1. Triage each residual item: automate now vs needs operator secret/data',
    '2. For automatable items (code, content defaults, footer year, copy, wiring): spawn clear implement instructions in your plan',
    '3. For operator-only secrets (real phone numbers, live prices you cannot invent): list them under BLOCKED_ON_OPERATOR',
    '4. Prefer shipping with safe placeholders only when operator data is missing — never invent real business credentials',
    '',
    '=== REQUIRED OUTPUT ===',
    '- Next execution plan for research/implement/test as needed',
    '- worker_done --body must include:',
    '  AUTOPILOT: CONTINUE   (if more automated work remains)',
    '  or AUTOPILOT: DONE    (if only operator-blocked items remain or product is shippable)',
    '  VERDICT: PASS when the next automated wave is planned',
    '  VERDICT: FAIL only if you need a human decision that blocks all progress'
  ].join('\n')
}

export function parseAutopilotDirective(
  text: string | null | undefined
): 'continue' | 'done' | 'unknown' {
  if (!text) {
    return 'unknown'
  }
  const n = text.replace(/\s+/g, ' ').toUpperCase()
  if (/\bAUTOPILOT\s*:\s*DONE\b/.test(n)) {
    return 'done'
  }
  if (/\bAUTOPILOT\s*:\s*CONTINUE\b/.test(n)) {
    return 'continue'
  }
  return 'unknown'
}
