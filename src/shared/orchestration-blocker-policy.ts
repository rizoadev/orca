/**
 * Deterministic blocker classification + self-heal policy for product orchestration.
 * Rules-first (no LLM required) so supervisor can heal after crash/LLM errors.
 */

export type OrchestrationBlockerKind =
  | 'llm_error'
  | 'auth'
  | 'hung'
  | 'spawn_failed'
  | 'test_fail'
  | 'review_fail'
  | 'env'
  | 'unknown'

export type OrchestrationHealAction =
  | 'retry_same_agent'
  | 'switch_agent'
  | 'rework_implement'
  | 'replan_manager'
  | 'escalate'
  | 'none'

export type OrchestrationHealDecision = {
  blocker: OrchestrationBlockerKind
  action: OrchestrationHealAction
  /** Preferred TUI agent after failover (when switch_agent). */
  nextAgent?: string
  /** Human-readable rationale for the decision trail. */
  reason: string
  /** Attempts used for this stage (1-based). */
  attempt: number
  /** Stop healing and mark product failed / escalate. */
  giveUp: boolean
}

/** Default failover chain when a model/agent errors or hangs. */
export const DEFAULT_AGENT_FAILOVER_CHAIN = [
  'pi',
  'claude',
  'codex',
  'gemini',
  'cursor'
] as const

export const HEAL_MAX_AGENT_SWITCHES = 3
export const HEAL_MAX_SAME_AGENT_RETRIES = 2

const LLM_ERROR_RE =
  /\b(llm|model|api)\b.{0,40}\b(error|fail|failed|unavailable|overloaded|timeout|rate.?limit|429|500|502|503)\b|\b(context.?length|token.?limit|output.?truncated|provider.?error|anthropic|openai).{0,20}\b(error|fail)/i

const AUTH_RE =
  /\b(auth|login|unauthorized|401|403|api.?key|not.?logged|missing.?credential|oauth|token.?expired|invalid.?token)\b/i

const HUNG_RE =
  /\b(hung|no heartbeat|stale dispatch|unresponsive|timed?\s*out|timeout waiting|never became)\b/i

const SPAWN_RE =
  /\b(spawn|launch).{0,30}\b(fail|failed|error)|no recognized agent|never became a recognized\b/i

const ENV_RE =
  /\b(enoent|eacces|permission denied|module not found|cannot find module|command not found|missing dependency|npm err|pnpm err|yarn err|docker|port already)\b/i

const TEST_FAIL_RE = /\bVERDICT\s*:\s*FAIL\b|\bTESTS?\s+FAILED\b|\bBLOCKING BUG\b/i
const REVIEW_FAIL_RE = /\bVERDICT\s*:\s*(FAIL|REJECTED)\b|\bMUST FIX\b|\bREJECTED\b/i

export function classifyOrchestrationBlocker(input: {
  text?: string | null
  role?: string | null
  hung?: boolean
}): OrchestrationBlockerKind {
  if (input.hung) {
    return 'hung'
  }
  const text = input.text ?? ''
  if (!text.trim()) {
    return 'unknown'
  }
  if (AUTH_RE.test(text)) {
    return 'auth'
  }
  if (LLM_ERROR_RE.test(text)) {
    return 'llm_error'
  }
  if (SPAWN_RE.test(text)) {
    return 'spawn_failed'
  }
  if (HUNG_RE.test(text)) {
    return 'hung'
  }
  if (ENV_RE.test(text)) {
    return 'env'
  }
  if (input.role === 'tester' && TEST_FAIL_RE.test(text)) {
    return 'test_fail'
  }
  if (input.role === 'reviewer' && REVIEW_FAIL_RE.test(text)) {
    return 'review_fail'
  }
  if (TEST_FAIL_RE.test(text)) {
    return 'test_fail'
  }
  if (REVIEW_FAIL_RE.test(text)) {
    return 'review_fail'
  }
  return 'unknown'
}

export function pickFailoverAgent(
  preferred: string,
  attempt: number,
  chain: readonly string[] = DEFAULT_AGENT_FAILOVER_CHAIN
): string {
  const base = preferred.trim() || chain[0] || 'pi'
  const normalized = chain.map((a) => a.trim()).filter(Boolean)
  if (normalized.length === 0) {
    return base
  }
  // Put preferred first, then remaining chain without dupes.
  const ordered = [base, ...normalized.filter((a) => a.toLowerCase() !== base.toLowerCase())]
  const index = Math.max(0, Math.min(attempt - 1, ordered.length - 1))
  return ordered[index]!
}

export function decideOrchestrationHeal(input: {
  blocker: OrchestrationBlockerKind
  attempt: number
  preferredAgent?: string | null
  role?: string | null
  chain?: readonly string[]
}): OrchestrationHealDecision {
  const attempt = Math.max(1, input.attempt)
  const preferred = input.preferredAgent?.trim() || 'pi'
  const chain = input.chain ?? DEFAULT_AGENT_FAILOVER_CHAIN

  if (input.blocker === 'test_fail' || input.blocker === 'review_fail') {
    return {
      blocker: input.blocker,
      action: 'rework_implement',
      reason: `${input.blocker}: open implement rework with failure feedback`,
      attempt,
      giveUp: false
    }
  }

  if (input.blocker === 'auth') {
    return {
      blocker: 'auth',
      action: attempt >= HEAL_MAX_SAME_AGENT_RETRIES ? 'escalate' : 'retry_same_agent',
      reason:
        attempt >= HEAL_MAX_SAME_AGENT_RETRIES
          ? 'auth still failing — needs human credential fix'
          : 'retry once after auth/transient session glitch',
      attempt,
      giveUp: attempt >= HEAL_MAX_SAME_AGENT_RETRIES
    }
  }

  if (
    input.blocker === 'llm_error' ||
    input.blocker === 'hung' ||
    input.blocker === 'spawn_failed'
  ) {
    if (attempt > HEAL_MAX_AGENT_SWITCHES) {
      return {
        blocker: input.blocker,
        action: 'escalate',
        reason: `${input.blocker}: exceeded agent failover budget (${HEAL_MAX_AGENT_SWITCHES})`,
        attempt,
        giveUp: true
      }
    }
    const nextAgent = pickFailoverAgent(preferred, attempt + 1, chain)
    const switchNeeded = nextAgent.toLowerCase() !== preferred.toLowerCase() || attempt > 1
    return {
      blocker: input.blocker,
      action: switchNeeded ? 'switch_agent' : 'retry_same_agent',
      nextAgent,
      reason: switchNeeded
        ? `${input.blocker}: switch agent ${preferred} → ${nextAgent}`
        : `${input.blocker}: retry same agent ${preferred}`,
      attempt,
      giveUp: false
    }
  }

  if (input.blocker === 'env') {
    return {
      blocker: 'env',
      action: attempt >= 2 ? 'escalate' : 'retry_same_agent',
      reason:
        attempt >= 2
          ? 'env/deps still broken — escalate'
          : 'retry once for transient env/deps failure',
      attempt,
      giveUp: attempt >= 2
    }
  }

  // unknown
  if (attempt >= HEAL_MAX_AGENT_SWITCHES) {
    return {
      blocker: 'unknown',
      action: 'escalate',
      reason: 'unknown blocker persisted — escalate to operator',
      attempt,
      giveUp: true
    }
  }
  const nextAgent = pickFailoverAgent(preferred, attempt + 1, chain)
  return {
    blocker: 'unknown',
    action: nextAgent !== preferred ? 'switch_agent' : 'retry_same_agent',
    nextAgent,
    reason: `unknown blocker: try ${nextAgent}`,
    attempt,
    giveUp: false
  }
}

export function formatHealDecisionComment(decision: OrchestrationHealDecision): string {
  const parts = [
    `Self-heal decision`,
    `blocker=${decision.blocker}`,
    `action=${decision.action}`,
    decision.nextAgent ? `nextAgent=${decision.nextAgent}` : null,
    `attempt=${decision.attempt}`,
    decision.giveUp ? 'giveUp=true' : null,
    decision.reason
  ]
  return parts.filter(Boolean).join(' · ')
}
