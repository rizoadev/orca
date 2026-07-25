import { describe, expect, it } from 'vitest'
import {
  buildProductPipelinePlan,
  buildRoleTaskSpec,
  parsePipelineVerdict
} from './product-pipeline'

describe('product-pipeline', () => {
  it('plans manage → research → implement → test → review', () => {
    const plan = buildProductPipelinePlan()
    expect(plan.map((s) => s.stage)).toEqual([
      'manage',
      'research',
      'implement',
      'test',
      'review'
    ])
    expect(plan[1]?.dependsOnStages).toEqual(['manage'])
    expect(plan[0]?.role).toBe('manager')
  })

  it('parses tester/reviewer verdicts', () => {
    expect(parsePipelineVerdict('All good.\nVERDICT: PASS')).toBe('pass')
    expect(parsePipelineVerdict('Broken login.\nVERDICT: FAIL')).toBe('fail')
    expect(parsePipelineVerdict('meh')).toBe('unknown')
  })

  it('builds role-specific specs with rework feedback', () => {
    const implement = buildRoleTaskSpec({
      role: 'implementer',
      productGoal: 'OTP email mockup',
      stage: 'implement',
      attempt: 2,
      priorFeedback: 'Missing resend button',
      researchSummary: 'Use AuthCard component'
    })
    expect(implement).toContain('IMPLEMENTER')
    expect(implement).toContain('REWORK FEEDBACK')
    expect(implement).toContain('Missing resend button')
    expect(implement).toContain('RESEARCH BRIEF')
  })

  it('builds a manager brief for operator-facing planning', () => {
    const manager = buildRoleTaskSpec({
      role: 'manager',
      productGoal: 'Ship OTP mockup',
      stage: 'manage',
      attempt: 1
    })
    expect(manager).toContain('MANAGER')
    expect(manager).toContain('Do NOT implement product code')
  })
})
