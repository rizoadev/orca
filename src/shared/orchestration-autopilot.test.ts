import { describe, expect, it } from 'vitest'
import {
  extractOpenTodosFromAgentOutput,
  parseAutopilotDirective,
  shouldAutopilotContinue,
  withRootAutopilotFlag
} from './orchestration-autopilot'

const SAMPLE = `
Before go-live, operator needs to update 5 TODOs in index.html:
 1. Real WhatsApp number
 2. Cumi Segar price
 3. Cumi Beku price
 4. Cumi Jumbo price
 5. Footer year (currently © 2025)

 Now idle.
`

describe('orchestration-autopilot', () => {
  it('extracts numbered residual TODOs and idle handoff', () => {
    const extracted = extractOpenTodosFromAgentOutput(SAMPLE)
    expect(extracted.idleHandoff).toBe(true)
    expect(extracted.todos).toHaveLength(5)
    expect(extracted.todos[0]).toContain('WhatsApp')
    expect(extracted.todos[4]).toContain('Footer year')
  })

  it('continues autopilot when TODOs remain', () => {
    const extracted = extractOpenTodosFromAgentOutput(SAMPLE)
    expect(
      shouldAutopilotContinue({
        autopilotEnabled: true,
        extracted,
        stage: 'implement'
      })
    ).toBe(true)
    expect(
      shouldAutopilotContinue({
        autopilotEnabled: false,
        extracted,
        stage: 'implement'
      })
    ).toBe(false)
  })

  it('stores autopilot flag on root result json', () => {
    const json = withRootAutopilotFlag(
      JSON.stringify({ kind: 'product_pipeline_root', goal: 'Ship' }),
      true
    )
    expect(JSON.parse(json)).toMatchObject({ autopilot: true, goal: 'Ship' })
  })

  it('parses manager autopilot directive', () => {
    expect(parseAutopilotDirective('AUTOPILOT: CONTINUE\nVERDICT: PASS')).toBe('continue')
    expect(parseAutopilotDirective('AUTOPILOT: DONE')).toBe('done')
  })
})
