import { describe, expect, it } from 'vitest'
import {
  classifyOrchestrationBlocker,
  decideOrchestrationHeal,
  pickFailoverAgent
} from './orchestration-blocker-policy'

describe('orchestration-blocker-policy', () => {
  it('classifies llm / auth / hung / spawn text', () => {
    expect(classifyOrchestrationBlocker({ text: 'Anthropic API error 529 overloaded' })).toBe(
      'llm_error'
    )
    expect(classifyOrchestrationBlocker({ text: 'Not logged in / missing API key' })).toBe('auth')
    expect(classifyOrchestrationBlocker({ hung: true })).toBe('hung')
    expect(
      classifyOrchestrationBlocker({ text: 'Spawned term_x never became a recognized pi agent' })
    ).toBe('spawn_failed')
  })

  it('classifies tester verdict fails', () => {
    expect(
      classifyOrchestrationBlocker({
        role: 'tester',
        text: 'Login broken\nVERDICT: FAIL'
      })
    ).toBe('test_fail')
  })

  it('picks failover agents by attempt', () => {
    expect(pickFailoverAgent('pi', 1)).toBe('pi')
    expect(pickFailoverAgent('pi', 2)).toBe('claude')
    expect(pickFailoverAgent('pi', 3)).toBe('codex')
  })

  it('switches agent on llm_error and reworks on test_fail', () => {
    const llm = decideOrchestrationHeal({
      blocker: 'llm_error',
      attempt: 1,
      preferredAgent: 'pi'
    })
    expect(llm.action).toBe('switch_agent')
    expect(llm.nextAgent).toBe('claude')

    const test = decideOrchestrationHeal({
      blocker: 'test_fail',
      attempt: 1,
      preferredAgent: 'pi'
    })
    expect(test.action).toBe('rework_implement')
  })
})
