// Why: fold follow-up instructions into a not-yet-started run instead of
// spawning duplicate agent launches (Multica-style coalescing, Orca-native).

import { reattributeForMergedFollowUp, type AgentRunAttribution } from './agent-run-attribution'

export type CoalesceTargetState = 'pending' | 'ready' | 'running' | 'done' | 'failed' | 'unknown'

export type CoalesceFollowUpInput = {
  targetKey: string
  state: CoalesceTargetState
  existingMessages: string[]
  nextMessage: string
  existingAttribution?: AgentRunAttribution | null
  nextAttribution?: AgentRunAttribution | null
  /** Max messages retained after merge (bounds memory). */
  maxMessages?: number
}

export type CoalesceFollowUpResult =
  | {
      outcome: 'merged'
      targetKey: string
      messages: string[]
      attribution?: AgentRunAttribution
    }
  | {
      outcome: 'already_running' | 'no_pending' | 'empty' | 'refused'
      targetKey: string
      reason?: string
    }

const DEFAULT_MAX_MESSAGES = 12

function normalizeMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}

export function canCoalesceIntoState(state: CoalesceTargetState): boolean {
  return state === 'pending' || state === 'ready'
}

export function tryCoalesceFollowUp(input: CoalesceFollowUpInput): CoalesceFollowUpResult {
  const targetKey = input.targetKey.trim()
  const nextMessage = normalizeMessage(input.nextMessage)
  if (!targetKey) {
    return { outcome: 'refused', targetKey, reason: 'empty target key' }
  }
  if (!nextMessage) {
    return { outcome: 'empty', targetKey }
  }
  if (input.state === 'running') {
    return { outcome: 'already_running', targetKey }
  }
  if (!canCoalesceIntoState(input.state)) {
    return { outcome: 'no_pending', targetKey, reason: `state=${input.state}` }
  }

  const existing = input.existingMessages.map(normalizeMessage).filter(Boolean)
  // Why: identical consecutive follow-ups are noise; keep first occurrence only.
  const withoutDup = existing.filter((message) => message !== nextMessage)
  const max = input.maxMessages ?? DEFAULT_MAX_MESSAGES
  const messages = [...withoutDup, nextMessage].slice(-max)

  const attribution =
    input.nextAttribution && input.existingAttribution
      ? reattributeForMergedFollowUp({
          previous: input.existingAttribution,
          next: input.nextAttribution
        })
      : (input.nextAttribution ?? input.existingAttribution ?? undefined)

  return {
    outcome: 'merged',
    targetKey,
    messages,
    ...(attribution ? { attribution } : {})
  }
}

/** Join coalesced messages into one agent-facing prompt body. */
export function formatCoalescedPrompt(messages: readonly string[]): string {
  const cleaned = messages.map(normalizeMessage).filter(Boolean)
  if (cleaned.length === 0) {
    return ''
  }
  if (cleaned.length === 1) {
    return cleaned[0]!
  }
  return [
    'Multiple follow-up instructions were queued before this run started.',
    'Address every item below in one pass (newest last):',
    '',
    ...cleaned.map((message, index) => `${index + 1}. ${message}`)
  ].join('\n')
}
