/** Parse @mentions from operator task comments for routing. */

export type CommentMention =
  | { kind: 'handle'; value: string }
  | { kind: 'squad'; value: string }
  | { kind: 'role'; value: string }

// @squad:backend | @squad/backend | @role:tester | @term_abc | @handle
const MENTION_RE =
  /(?:^|[\s([{])@((?:squad|role)[:/][^\s@,;:]+|[a-zA-Z][\w./:-]{0,63})/g

export function parseCommentMentions(body: string): CommentMention[] {
  const seen = new Set<string>()
  const out: CommentMention[] = []
  for (const match of body.matchAll(MENTION_RE)) {
    const raw = match[1]?.trim()
    if (!raw) {
      continue
    }
    const lower = raw.toLowerCase()
    let mention: CommentMention
    if (lower.startsWith('squad:') || lower.startsWith('squad/')) {
      mention = { kind: 'squad', value: raw.slice(6).trim() }
    } else if (lower.startsWith('role:') || lower.startsWith('role/')) {
      mention = { kind: 'role', value: raw.slice(5).trim() }
    } else {
      mention = { kind: 'handle', value: raw }
    }
    if (!mention.value) {
      continue
    }
    const key = `${mention.kind}:${mention.value.toLowerCase()}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(mention)
  }
  return out
}

/** Join coalesced operator comment bodies into one agent-facing block. */
export function formatCoalescedPromptBodies(bodies: readonly string[]): string {
  const cleaned = bodies.map((b) => b.trim()).filter(Boolean)
  if (cleaned.length === 0) {
    return ''
  }
  if (cleaned.length === 1) {
    return cleaned[0]!
  }
  return [
    `${cleaned.length} operator comments were queued — address every item (newest last):`,
    '',
    ...cleaned.map((body, index) => `${index + 1}. ${body}`)
  ].join('\n')
}

export function buildOperatorFollowUpPrompt(input: {
  taskId: string
  commentBody: string
  author: string
  taskSpec: string
  role?: string | null
  dispatchId?: string | null
}): string {
  const roleLine = input.role ? `Your role: ${input.role}` : null
  const dispatchLine = input.dispatchId ? `Active dispatch: ${input.dispatchId}` : null
  const spec =
    input.taskSpec.length > 1200 ? `${input.taskSpec.slice(0, 1200)}…` : input.taskSpec
  return [
    `[ORCA OPERATOR COMMENT — task ${input.taskId}]`,
    `From: ${input.author}`,
    roleLine,
    dispatchLine,
    '',
    input.commentBody.trim(),
    '',
    '---',
    'Address this feedback on the task. If you already finished, resume and apply the change.',
    'When done, send worker_done for your current dispatch (or after the new dispatch preamble if one was re-issued).',
    '',
    'Task context:',
    spec
  ]
    .filter((line) => line !== null)
    .join('\n')
}
