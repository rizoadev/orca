import { describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-types'
import { resolveTelegramBridgeSessionTarget, shouldMirrorAssistantMessage } from './session-target'

function entry(
  partial: Partial<AgentStatusIpcPayload> &
    Pick<AgentStatusIpcPayload, 'paneKey' | 'state' | 'worktreeId' | 'terminalHandle'>
): AgentStatusIpcPayload {
  return {
    prompt: '',
    receivedAt: 1,
    ...partial
  } as AgentStatusIpcPayload
}

describe('resolveTelegramBridgeSessionTarget', () => {
  it('picks the most recent active agent for the repo', () => {
    const target = resolveTelegramBridgeSessionTarget(
      [
        entry({
          paneKey: 'a:1',
          state: 'idle',
          worktreeId: 'repo-a::/tmp/a',
          terminalHandle: 'h-idle',
          receivedAt: 100
        }),
        entry({
          paneKey: 'a:2',
          state: 'working',
          worktreeId: 'repo-a::/tmp/a',
          terminalHandle: 'h-work',
          receivedAt: 50
        }),
        entry({
          paneKey: 'b:1',
          state: 'working',
          worktreeId: 'repo-b::/tmp/b',
          terminalHandle: 'h-other',
          receivedAt: 200
        })
      ],
      'repo-a'
    )
    expect(target?.handle).toBe('h-work')
  })

  it('falls back to live agent PTYs when hook snapshot is empty', () => {
    const target = resolveTelegramBridgeSessionTarget([], 'repo-a', [
      {
        handle: 'shell-1',
        worktreeId: 'repo-a::/tmp/a',
        connected: true,
        writable: true,
        title: 'bash',
        lastOutputAt: 10
      },
      {
        handle: 'agent-1',
        worktreeId: 'repo-a::/tmp/a',
        connected: true,
        writable: true,
        title: 'claude',
        lastOutputAt: 5,
        launchAgent: 'claude'
      }
    ])
    expect(target?.handle).toBe('agent-1')
  })

  it('accepts hook rows without paneKey when terminalHandle exists', () => {
    const target = resolveTelegramBridgeSessionTarget(
      [
        {
          paneKey: '',
          state: 'idle',
          worktreeId: 'repo-a::/tmp/a',
          terminalHandle: 'h-1',
          prompt: '',
          receivedAt: 1,
          connectionId: null,
          stateStartedAt: 1
        } as AgentStatusIpcPayload
      ],
      'repo-a'
    )
    expect(target?.handle).toBe('h-1')
  })

  it('returns null when no live agent matches the repo', () => {
    const target = resolveTelegramBridgeSessionTarget(
      [
        entry({
          paneKey: 'b:1',
          state: 'working',
          worktreeId: 'repo-b::/tmp/b',
          terminalHandle: 'h-other',
          receivedAt: 200
        })
      ],
      'repo-a'
    )
    expect(target).toBeNull()
  })

  it('matches via display-name alias and single-repo fallback', () => {
    const byAlias = resolveTelegramBridgeSessionTarget(
      [],
      'repo-uuid',
      [
        {
          handle: 'h-1',
          worktreeId: 'ORCA_AI::/tmp/orca',
          connected: true,
          writable: true,
          title: 'claude',
          lastOutputAt: 1,
          launchAgent: 'claude'
        }
      ],
      ['ORCA_AI']
    )
    expect(byAlias?.handle).toBe('h-1')

    const single = resolveTelegramBridgeSessionTarget([], 'unknown-mapped-id', [
      {
        handle: 'only',
        worktreeId: 'repo-z::/tmp/z',
        connected: true,
        writable: true,
        title: 'codex',
        lastOutputAt: 1,
        launchAgent: 'codex'
      }
    ])
    expect(single?.handle).toBe('only')
  })
})

describe('shouldMirrorAssistantMessage', () => {
  it('mirrors new settled assistant text only', () => {
    expect(
      shouldMirrorAssistantMessage({
        state: 'done',
        message: 'hello',
        previousMessage: 'old'
      })
    ).toBe(true)
    expect(
      shouldMirrorAssistantMessage({
        state: 'working',
        message: 'hello',
        previousMessage: undefined
      })
    ).toBe(false)
    expect(
      shouldMirrorAssistantMessage({
        state: 'idle',
        message: 'hello',
        previousMessage: 'hello'
      })
    ).toBe(false)
  })
})
