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

  it('ignores prose and verdict outside the SUBTASK BREAKDOWN block', () => {
    const text =
      '**Problem framing:** pipeline exists but never ran on GitLab CI.\n' +
      '**SUBTASK BREAKDOWN:**\n' +
      '[1] Replace CDP with playwright.launch — implement — shared runners have no localhost:9222\n' +
      '[2] Configure CI secrets — devops — add CLOUDFLARE_API_TOKEN to GitLab variables\n' +
      '**VERDICT: PASS**\n' +
      'implement'
    const items = parseSubtaskBreakdown(text)
    expect(items).toHaveLength(2)
    expect(items[0]!.title).toBe('Replace CDP with playwright.launch')
    expect(items[1]!.title).toBe('Configure CI secrets')
  })

  it('parses a JSON array output, ignoring prose around it', () => {
    const text =
      '**Problem framing:** pipeline exists but never ran on GitLab CI.\n' +
      '```json\n' +
      '[{"title": "Replace CDP with playwright.launch", "role": "implement", "description": "shared runners have no localhost:9222"},{"title": "Configure CI secrets", "role": "devops", "description": "add tokens to GitLab variables"}]\n' +
      '```\n' +
      '**VERDICT: PASS**'
    const items = parseSubtaskBreakdown(text)
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      title: 'Replace CDP with playwright.launch',
      role: 'implement',
      description: 'shared runners have no localhost:9222'
    })
    expect(items[1]!.role).toBe('devops')
  })
})
