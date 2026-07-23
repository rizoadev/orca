import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { findAgentStatusForTab } from './issue-ai-work-badge'

describe('findAgentStatusForTab', () => {
  const workingEntry = { state: 'working' } as unknown as AgentStatusEntry
  const doneEntry = { state: 'done' } as unknown as AgentStatusEntry

  it('resolves by tab prefix when no explicit paneKey is known', () => {
    expect(
      findAgentStatusForTab(
        {
          'tab-42:11111111-1111-4111-8111-111111111111': workingEntry
        },
        'tab-42'
      )
    ).toBe(workingEntry)
  })

  it('prefers an explicit paneKey when it exists', () => {
    expect(
      findAgentStatusForTab(
        {
          'tab-9:aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee': doneEntry,
          'tab-9:ffffffff-1111-4222-8333-444444444444': workingEntry
        },
        'tab-9',
        'tab-9:ffffffff-1111-4222-8333-444444444444'
      )
    ).toBe(workingEntry)
  })

  it('returns undefined when no pane matches', () => {
    expect(findAgentStatusForTab({}, 'tab-none')).toBeUndefined()
  })

  it('does not confuse different tabs with a shared prefix boundary', () => {
    expect(
      findAgentStatusForTab(
        {
          'tab-10:11111111-1111-4111-8111-111111111111': workingEntry
        },
        'tab-1'
      )
    ).toBeUndefined()
  })
})
