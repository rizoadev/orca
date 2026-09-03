/**
 * Unit tests for the workspace-scoped Pi chat session engine: multi-emitter
 * fan-out, worktree path resolution, session lifecycle, and message streaming.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllPiChatSessionsForTests,
  getPiChatSession,
  sendPiChatMessage,
  stopPiChatSession,
  subscribeToPiChat,
  type PiChatEmitter,
  type PiWorktreePathResolver
} from './workspace-chat-session'
import type { PiChatEvent, PiChatSessionSnapshot } from '../../shared/pi-chat-types'

// Why: the engine lazily imports the Pi SDK through createPiSession; tests
// stub it so no real SDK/auth is touched.
const createPiSessionMock = vi.hoisted(() => vi.fn())

vi.mock('./pi-session-factory', () => ({
  createPiSession: createPiSessionMock,
  piLog: vi.fn()
}))

vi.mock('./pi-session-manager', () => ({
  listPiIssueSessions: vi.fn(async () => []),
  deletePiIssueSession: vi.fn()
}))

vi.mock('./pi-model-registry', () => ({
  listPiModels: vi.fn(async () => []),
  setPiSessionModel: vi.fn(async () => 'provider/model')
}))

const resolveWorktreePath: PiWorktreePathResolver = vi.fn(async (worktreeId: string) => {
  const parsed = worktreeId.split('::')
  return parsed[1] ?? `/fake/${worktreeId}`
})

function fakeAgentSession(overrides: Record<string, unknown> = {}) {
  return {
    messages: [],
    subscribe: vi.fn(),
    prompt: vi.fn(async () => {}),
    dispose: vi.fn(),
    ...overrides
  }
}

function collectEvents(): { events: PiChatEvent[]; emitter: PiChatEmitter } {
  const events: PiChatEvent[] = []
  const emitter: PiChatEmitter = (event) => events.push(event)
  return { events, emitter }
}

beforeEach(() => {
  createPiSessionMock.mockReset()
  createPiSessionMock.mockImplementation(async () => ({
    agentSession: fakeAgentSession(),
    modelId: 'model-1',
    provider: 'provider-1',
    sessionFile: '/fake/session.jsonl'
  }))
})

afterEach(() => {
  clearAllPiChatSessionsForTests()
})

describe('subscribeToPiChat', () => {
  it('creates a session and emits a snapshot to the subscriber', async () => {
    const { events, emitter } = collectEvents()
    const result = await subscribeToPiChat(
      { sessionId: 'pi-chat:w1', worktreeId: 'repo::/wt' },
      resolveWorktreePath,
      emitter
    )

    expect(createPiSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: '/wt', sessionId: 'pi-chat:w1' }),
      expect.any(String)
    )
    expect(events[0]).toMatchObject({ type: 'snapshot' })
    expect(result.snapshot.messages).toEqual([])
    expect(typeof result.unsubscribe).toBe('function')
  })

  it('resolves the worktree path through the resolver and uses it as cwd', async () => {
    const { emitter } = collectEvents()
    await subscribeToPiChat(
      { sessionId: 'pi-chat:w2', worktreeId: 'repo::/project/a' },
      resolveWorktreePath,
      emitter
    )
    expect(resolveWorktreePath).toHaveBeenCalledWith('repo::/project/a')
    expect(createPiSessionMock.mock.calls[0]![0]!.cwd).toBe('/project/a')
  })

  it('keeps the warm session when subscribing again without new mode', async () => {
    const first = collectEvents()
    await subscribeToPiChat(
      { sessionId: 'pi-chat:w3', worktreeId: 'repo::/wt' },
      resolveWorktreePath,
      first.emitter
    )
    const second = collectEvents()
    await subscribeToPiChat(
      { sessionId: 'pi-chat:w3', worktreeId: 'repo::/wt' },
      resolveWorktreePath,
      second.emitter
    )

    expect(createPiSessionMock).toHaveBeenCalledTimes(1)
    expect(second.events[0]).toMatchObject({ type: 'snapshot' })
  })
})

describe('sendPiChatMessage', () => {
  it('fans a user message out to every subscriber', async () => {
    const { events, emitter } = collectEvents()
    await subscribeToPiChat(
      { sessionId: 'pi-chat:w4', worktreeId: 'repo::/wt' },
      resolveWorktreePath,
      emitter
    )
    events.length = 0

    await sendPiChatMessage('pi-chat:w4', 'repo::/wt', 'hello pi', resolveWorktreePath)

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'message',
        message: expect.objectContaining({ role: 'user', content: 'hello pi' })
      })
    )
    expect(events).toContainEqual(expect.objectContaining({ type: 'status', status: 'idle' }))
  })

  it('emits assistant deltas to every subscriber while streaming', async () => {
    const { events, emitter } = collectEvents()
    await subscribeToPiChat(
      { sessionId: 'pi-chat:w5', worktreeId: 'repo::/wt' },
      resolveWorktreePath,
      emitter
    )
    events.length = 0

    // Hang the prompt so we can inspect mid-stream events.
    const agentSession = (await createPiSessionMock.mock.results[0]!.value).agentSession
    let resolvePrompt!: () => void
    agentSession.prompt.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePrompt = resolve
        })
    )

    // Start send — don't await yet.
    const sendP = sendPiChatMessage('pi-chat:w5', 'repo::/wt', 'hello', resolveWorktreePath)

    // The first text_delta should produce a `message` event (emit the new assistant msg)
    // and subsequent deltas produce `assistantDelta` events.
    const sdkListener = agentSession.subscribe.mock.calls[0]![0] as (e: unknown) => void
    sdkListener({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'Hello' }
    })
    sdkListener({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: ' world' }
    })

    expect(
      events.some(
        (e) =>
          e.type === 'message' &&
          (e as { message?: { role: string } }).message?.role === 'assistant'
      )
    ).toBe(true)
    expect(
      events.some(
        (e) => e.type === 'assistantDelta' && (e as { delta?: string }).delta === ' world'
      )
    ).toBe(true)

    resolvePrompt()
    await sendP
  })

  it('rejects a second send while the agent is running', async () => {
    const { emitter } = collectEvents()
    await subscribeToPiChat(
      { sessionId: 'pi-chat:w6', worktreeId: 'repo::/wt' },
      resolveWorktreePath,
      emitter
    )
    const agentSession = (await createPiSessionMock.mock.results[0]!.value).agentSession
    let resolvePrompt: (() => void) | null = null
    agentSession.prompt.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePrompt = resolve
        })
    )

    const firstSend = sendPiChatMessage('pi-chat:w6', 'repo::/wt', 'first', resolveWorktreePath)
    await expect(
      sendPiChatMessage('pi-chat:w6', 'repo::/wt', 'second', resolveWorktreePath)
    ).rejects.toThrow('still responding')
    // Why: TS narrows the closure-assigned variable to null/never; widen before the optional call.
    ;(resolvePrompt as (() => void) | null)?.()
    await firstSend
  })

  it('records a system error message when the prompt throws', async () => {
    const { events, emitter } = collectEvents()
    await subscribeToPiChat(
      { sessionId: 'pi-chat:w7', worktreeId: 'repo::/wt' },
      resolveWorktreePath,
      emitter
    )
    events.length = 0
    const agentSession = (await createPiSessionMock.mock.results[0]!.value).agentSession
    agentSession.prompt.mockRejectedValueOnce(new Error('boom'))

    await sendPiChatMessage('pi-chat:w7', 'repo::/wt', 'hello', resolveWorktreePath)

    expect(
      events.some(
        (e) =>
          e.type === 'message' && e.message.role === 'system' && e.message.content.includes('boom')
      )
    ).toBe(true)
    expect(events.some((e) => e.type === 'status' && e.status === 'error')).toBe(true)
  })
})

describe('stopPiChatSession', () => {
  it('disposes the agent session and removes the record', async () => {
    const { emitter } = collectEvents()
    await subscribeToPiChat(
      { sessionId: 'pi-chat:w8', worktreeId: 'repo::/wt' },
      resolveWorktreePath,
      emitter
    )
    const agentSession = (await createPiSessionMock.mock.results[0]!.value).agentSession

    await stopPiChatSession('pi-chat:w8')

    expect(agentSession.dispose).toHaveBeenCalled()
    expect(await getPiChatSession('pi-chat:w8')).toBeNull()
  })

  it('detaches a single subscriber without killing a shared session', async () => {
    const first = collectEvents()
    const second = collectEvents()
    const r1 = await subscribeToPiChat(
      { sessionId: 'pi-chat:w9', worktreeId: 'repo::/wt' },
      resolveWorktreePath,
      first.emitter
    )
    await subscribeToPiChat(
      { sessionId: 'pi-chat:w9', worktreeId: 'repo::/wt' },
      resolveWorktreePath,
      second.emitter
    )
    expect(createPiSessionMock).toHaveBeenCalledTimes(1)

    r1.unsubscribe()
    expect(await getPiChatSession('pi-chat:w9')).not.toBeNull()
  })
})

describe('session snapshot shape', () => {
  it('includes worktreeId, model, provider and messages', async () => {
    const { emitter } = collectEvents()
    const result = await subscribeToPiChat(
      { sessionId: 'pi-chat:w10', worktreeId: 'repo::/wt' },
      resolveWorktreePath,
      emitter
    )
    const snap: PiChatSessionSnapshot = result.snapshot
    expect(snap.worktreeId).toBe('repo::/wt')
    expect(snap.modelId).toBe('model-1')
    expect(snap.provider).toBe('provider-1')
    expect(snap.status).toBe('idle')
  })
})
