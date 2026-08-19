/**
 * Product pipeline: multi-role orchestration loop.
 *
 * research → implement → test → (fail? rework implement) → review → done
 * Not a single prompt inject — a DAG of role-scoped tasks with rework.
 */

export type ProductPipelineRole = 'manager' | 'researcher' | 'implementer' | 'tester' | 'reviewer'

export type ProductPipelineStage =
  | 'manage'
  | 'research'
  | 'implement'
  | 'test'
  | 'review'
  | 'done'
  | 'failed'

export type ProductPipelineRoleAgent = {
  role: ProductPipelineRole
  /** Matches Settings agentSquads id when present. */
  squadId: string
  /** Fallback TUI agent when no live squad terminal exists. */
  defaultAgent: string
  title: string
}

/** Default role catalog — orchestrator spawns these, not one generic coder. */
export const PRODUCT_PIPELINE_ROLES: readonly ProductPipelineRoleAgent[] = [
  {
    role: 'manager',
    squadId: 'manager',
    defaultAgent: 'pi',
    title: 'Manager'
  },
  {
    role: 'researcher',
    squadId: 'researcher',
    defaultAgent: 'pi',
    title: 'Researcher'
  },
  {
    role: 'implementer',
    squadId: 'backend',
    defaultAgent: 'pi',
    title: 'Implementer'
  },
  {
    role: 'tester',
    squadId: 'tester',
    defaultAgent: 'pi',
    title: 'Tester'
  },
  {
    role: 'reviewer',
    squadId: 'reviewer',
    defaultAgent: 'pi',
    title: 'Reviewer'
  }
] as const

export const PRODUCT_PIPELINE_MAX_REWORK = 3

export type ProductPipelinePlanStep = {
  stage: Exclude<ProductPipelineStage, 'done' | 'failed'>
  role: ProductPipelineRole
  title: string
  /** Dependency stage keys (not task ids). */
  dependsOnStages: Exclude<ProductPipelineStage, 'done' | 'failed'>[]
}

export function buildProductPipelinePlan(): ProductPipelinePlanStep[] {
  return [
    {
      stage: 'manage',
      role: 'manager',
      title: 'Manager plan',
      dependsOnStages: []
    },
    {
      stage: 'research',
      role: 'researcher',
      title: 'Research',
      dependsOnStages: ['manage']
    },
    {
      stage: 'implement',
      role: 'implementer',
      title: 'Implement',
      dependsOnStages: ['research']
    },
    {
      stage: 'test',
      role: 'tester',
      title: 'Test',
      dependsOnStages: ['implement']
    },
    {
      stage: 'review',
      role: 'reviewer',
      title: 'Review',
      dependsOnStages: ['test']
    }
  ]
}

export function roleForStage(
  stage: Exclude<ProductPipelineStage, 'done' | 'failed'>
): ProductPipelineRole {
  const step = buildProductPipelinePlan().find((entry) => entry.stage === stage)
  return step?.role ?? 'implementer'
}

export function resolveRoleAgent(
  role: ProductPipelineRole,
  defaultTuiAgent?: string | null
): ProductPipelineRoleAgent {
  const base =
    PRODUCT_PIPELINE_ROLES.find((entry) => entry.role === role) ?? PRODUCT_PIPELINE_ROLES[1]!
  const agent = defaultTuiAgent?.trim() || base.defaultAgent
  return { ...base, defaultAgent: agent }
}

export type PipelineVerdict = 'pass' | 'fail' | 'unknown'

/** Parse worker_done body/result for tester/reviewer gate. */
export function parsePipelineVerdict(text: string | null | undefined): PipelineVerdict {
  if (!text) {
    return 'unknown'
  }
  const normalized = text.replace(/\s+/g, ' ').toUpperCase()
  if (
    /\bVERDICT\s*:\s*PASS\b/.test(normalized) ||
    /\bVERDICT\s*:\s*APPROVED\b/.test(normalized) ||
    /\bSTATUS\s*:\s*PASS\b/.test(normalized)
  ) {
    return 'pass'
  }
  if (
    /\bVERDICT\s*:\s*FAIL\b/.test(normalized) ||
    /\bVERDICT\s*:\s*REJECTED\b/.test(normalized) ||
    /\bSTATUS\s*:\s*FAIL\b/.test(normalized)
  ) {
    return 'fail'
  }
  // Heuristic fallbacks for short agent summaries.
  if (/\b(ALL TESTS PASSED|LOOKS GOOD|APPROVED|LGTM)\b/.test(normalized)) {
    return 'pass'
  }
  if (/\b(TESTS? FAILED|BLOCKING BUG|MUST FIX|REJECTED)\b/.test(normalized)) {
    return 'fail'
  }
  return 'unknown'
}

export function buildRoleTaskSpec(args: {
  role: ProductPipelineRole
  productGoal: string
  stage: string
  attempt: number
  priorFeedback?: string | null
  researchSummary?: string | null
}): string {
  const goal = args.productGoal.trim()
  const feedback = args.priorFeedback?.trim()
  const research = args.researchSummary?.trim()

  switch (args.role) {
    case 'manager':
      return [
        `You are the MANAGER / product orchestrator (attempt ${args.attempt}).`,
        'You are the only role the human operator should need to talk to.',
        'Do NOT implement product code yourself. Plan, delegate, and keep the run unblocked.',
        '',
        '=== PRODUCT GOAL ===',
        goal,
        feedback ? `\n=== PRIOR BLOCKER / FEEDBACK ===\n${feedback}` : '',
        '',
        '=== YOUR JOB ===',
        '1. Clarify acceptance criteria and non-goals',
        '2. Produce a short execution plan for research → implement → test → review',
        '3. Call out risks, dependencies, and what would block shipping',
        '4. Note any model/tool constraints the workers should respect',
        '',
        '=== REQUIRED OUTPUT ===',
        '- Manager brief the researcher/implementer can follow',
        '- worker_done --body: 3-sentence plan summary + VERDICT: PASS when the team can start',
        '- If blocked on human input, VERDICT: FAIL with the exact question for the operator'
      ]
        .filter(Boolean)
        .join('\n')
    case 'researcher':
      return [
        `You are the RESEARCHER in a product pipeline (attempt ${args.attempt}).`,
        'Do NOT implement product code. Investigate and produce an actionable plan.',
        '',
        '=== PRODUCT GOAL ===',
        goal,
        feedback ? `\n=== MANAGER BRIEF ===\n${feedback}` : '',
        '',
        '=== YOUR JOB ===',
        'Do a SHORT research pass, then break the goal into concrete subtasks.',
        'Each subtask is a small, shippable work item that a dedicated agent can do.',
        '',
        '=== REQUIRED OUTPUT ===',
        'End worker_done --body with a SUBTASK BREAKDOWN list, one item per line:',
        '  [1] <title> — <role> — <1-line description>',
        '  [2] <title> — <role> — <1-line description>',
        '...',
        'Use roles from: research, implement, test, review, docs, devops, security (or similar).',
        'Prefer 3-8 subtasks. Keep each description concrete and actionable.',
        '',
        'Before the list, add 2-3 sentences: problem framing, key files/paths, risks.',
        'Include VERDICT: PASS when the breakdown is complete enough to execute.'
      ]
        .filter(Boolean)
        .join('\n')
    case 'implementer':
      return [
        `You are the IMPLEMENTER in a product pipeline (attempt ${args.attempt}).`,
        'Implement the product goal in this worktree. Prefer small, reviewable changes.',
        '',
        '=== PRODUCT GOAL ===',
        goal,
        research ? `\n=== RESEARCH BRIEF ===\n${research}` : '',
        feedback ? `\n=== REWORK FEEDBACK (must address) ===\n${feedback}` : '',
        '',
        '=== REQUIRED OUTPUT ===',
        '- Implement the change',
        '- Run relevant checks if practical',
        '- worker_done --body: what changed, how to verify, remaining risks',
        '- Include filesModified in the payload'
      ]
        .filter(Boolean)
        .join('\n')
    case 'tester':
      return [
        `You are the TESTER in a product pipeline (attempt ${args.attempt}).`,
        'Validate the implementer work against the product goal. Do not rewrite the feature unless a tiny fix is required for a clear bug you introduced while testing.',
        '',
        '=== PRODUCT GOAL ===',
        goal,
        research ? `\n=== RESEARCH BRIEF ===\n${research}` : '',
        '',
        '=== REQUIRED OUTPUT ===',
        '- Run tests / manual verification steps',
        '- List bugs with severity',
        '- End worker_done --body with exactly one of:',
        '  VERDICT: PASS',
        '  VERDICT: FAIL',
        '- On FAIL, include concrete fix instructions for the implementer'
      ]
        .filter(Boolean)
        .join('\n')
    case 'reviewer':
      return [
        `You are the REVIEWER / quality gate in a product pipeline (attempt ${args.attempt}).`,
        'Review for correctness, scope, and ship-readiness. Prefer approving if tests passed and code matches the goal.',
        '',
        '=== PRODUCT GOAL ===',
        goal,
        '',
        '=== REQUIRED OUTPUT ===',
        '- Short review notes',
        '- End worker_done --body with exactly one of:',
        '  VERDICT: PASS',
        '  VERDICT: FAIL',
        '- On FAIL, list required changes before ship'
      ].join('\n')
  }
}

export function defaultSquadSeed(defaultTuiAgent?: string | null): {
  id: string
  name: string
  leader: { agent: string }
  members: { agent: string }[]
  routing: 'leader_decide' | 'idle_first'
}[] {
  const agent = defaultTuiAgent?.trim() || 'pi'
  return PRODUCT_PIPELINE_ROLES.map((role) => ({
    id: role.squadId,
    name: role.title,
    leader: { agent },
    // Manager prefers a stronger primary when available; workers keep default agent.
    members:
      role.role === 'manager' ? [{ agent }, { agent: 'claude' }, { agent: 'codex' }] : [{ agent }],
    routing: role.role === 'implementer' ? 'idle_first' : 'leader_decide'
  }))
}
