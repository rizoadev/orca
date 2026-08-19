import { describe, expect, it } from 'vitest'
import { parseSubtaskBreakdown } from './subtask-breakdown'

describe('parseSubtaskBreakdown', () => {
  it('parses numbered items with role delimiter', () => {
    const items = parseSubtaskBreakdown(
      '[1] Add auth — implement — wire JWT middleware\n[2] Write tests — test — cover login flow'
    )
    expect(items).toEqual([
      { title: 'Add auth', role: 'implement', description: 'wire JWT middleware' },
      { title: 'Write tests', role: 'test', description: 'cover login flow' }
    ])
  })

  it('falls back to plain bullets as implement items', () => {
    const items = parseSubtaskBreakdown('- fix the login redirect\n- harden the API')
    expect(items).toHaveLength(2)
    expect(items[0]!.role).toBe('implement')
  })

  it('returns empty for empty input', () => {
    expect(parseSubtaskBreakdown(null)).toEqual([])
    expect(parseSubtaskBreakdown('')).toEqual([])
  })
})
