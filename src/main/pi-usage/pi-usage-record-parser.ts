import { record, type JsonRecord } from '../../shared/codex-rollout-jsonl-cursor'
import { ensureNumber, extractString } from '../usage/usage-record-coercion'
import type { PiUsageParsedEvent } from './types'

export type PiUsageParseContext = {
  sessionId: string
  /** Session header cwd; assistant records carry no workspace of their own. */
  cwd: string | null
}

// Only assistant records bill tokens and only the session header names the workspace.
const LINE_MARKERS = ['"usage"', '"cwd"']

function lineMayMatter(line: string): boolean {
  return LINE_MARKERS.some((marker) => line.includes(marker))
}

function timestampIso(entry: JsonRecord, message: JsonRecord): string | null {
  const raw = entry.timestamp ?? message.timestamp
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
  }
  return null
}

function toUsageEvent(
  entry: JsonRecord,
  message: JsonRecord,
  context: PiUsageParseContext
): PiUsageParsedEvent | null {
  const usage = record(message.usage)
  const timestamp = timestampIso(entry, message)
  if (!usage || !timestamp) {
    return null
  }
  const newInputTokens = ensureNumber(usage.input)
  const cacheReadTokens = ensureNumber(usage.cacheRead)
  const cacheWriteTokens = ensureNumber(usage.cacheWrite)
  const outputTokens = ensureNumber(usage.output)
  // Pi totals input + output + cache read + cache write, so cached input is not part of `input`.
  const cachedInputTokens = cacheReadTokens + cacheWriteTokens
  const inputTokens = newInputTokens + cachedInputTokens
  if (inputTokens + outputTokens === 0) {
    return null
  }
  return {
    sessionId: context.sessionId,
    timestamp,
    // Content key: forks copy usage tuples but rewrite record IDs.
    eventKey: [
      String(entry.timestamp ?? message.timestamp),
      String(message.model ?? ''),
      inputTokens,
      cachedInputTokens,
      outputTokens
    ].join(':'),
    model: extractString(message.model) ?? extractString(message.responseModel),
    cwd: context.cwd,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens: Math.min(ensureNumber(usage.reasoning), outputTokens),
    totalTokens: inputTokens + outputTokens
  }
}

export function parsePiUsageLine(line: string, context: PiUsageParseContext): PiUsageParsedEvent[] {
  if (!lineMayMatter(line)) {
    return []
  }
  let parsed: JsonRecord | undefined
  try {
    parsed = record(JSON.parse(line))
  } catch {
    return []
  }
  if (!parsed) {
    return []
  }
  // Header records may appear mid-file after a resume or fork.
  if (parsed.type === 'session') {
    context.cwd = extractString(parsed.cwd) ?? context.cwd
    return []
  }
  if (parsed.type !== 'message') {
    return []
  }
  const message = record(parsed.message)
  if (!message || message.role !== 'assistant') {
    return []
  }
  const event = toUsageEvent(parsed, message, context)
  return event ? [event] : []
}
