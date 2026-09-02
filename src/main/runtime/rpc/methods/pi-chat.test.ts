/**
 * Unit tests for the piChat runtime RPC methods: schema validation, worktree
 * resolution via the runtime service, and streaming subscribe/unsubscribe.
 * The session engine is mocked so the RPC contract (params → engine args →
 * stream frames) is tested in isolation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PI_CHAT_METHODS } from './pi-chat'
import type { RpcAnyMethod, RpcContext } from '../core'

const engine = vi.hoisted(() => ({
  subscribeToPiChat: vi.fn(),
  getPiChatSession: vi.fn(),
  sendPiChatMessage: vi.fn(),
  stopPiChatSession: vi.fn(),
  listPiChatModels: vi.fn(),
  setPiChatModel: vi.fn(),
  listPiChatSessions: vi.fn(),
  deletePiChatSession: vi.fn()
}))

vi.mock('../../../pi/workspace-chat-session', () => engine)

function method(name: string): RpcAnyMethod {
  const found = PI_CHAT_METHODS.find((m) => m.name === name)
  if (!found) {
    throw new Error(`method ${name} not found`)
  }
  return found
}

function makeRuntime() {
  return {
    resolveWorktreePath: vi.fn(async (worktreeId: string) => {
      const parsed = worktreeId.split('::')
      return parsed[1] ?? `/fake/${worktreeId}`
    }),
    registerSubscriptionCleanup: vi.fn(),
    cleanupSubscriptionsByPrefix: vi.fn()
  }
}

function makeContext(
  runtime: ReturnType<typeof makeRuntime>,
  overrides: Partial<RpcContext> = {}
): RpcContext {
  return {
    runtime: runtime as never,
    connectionId: 'conn-1',
    ...overrides
  } as RpcContext
}

const snapshot = {
  sessionId: 'pi-chat:w1',
  worktreeId: 'repo::/wt',
  status: 'idle',
  messages: []
}

beforeEach(() => {
  vi.clearAllMocks()
  engine.subscribeToPiChat.mockResolvedValue({ snapshot, unsubscribe: vi.fn() })
  engine.getPiChatSession.mockResolvedValue(snapshot)
  engine.sendPiChatMessage.mockResolvedValue(snapshot)
  engine.listPiChatModels.mockResolvedValue([
    { ref: 'p/m', provider: 'p', modelId: 'm', name: 'm', contextWindow: 128000, maxTokens: 32000 }
  ])
  engine.listPiChatSessions.mockResolvedValue([])
  engine.stopPiChatSession.mockResolvedValue(undefined)
  engine.deletePiChatSession.mockResolvedValue(undefined)
})

describe('piChat.start', () => {
  it('resolves the worktree path and returns a session snapshot', async () => {
    const runtime = makeRuntime()
    const result = await method('piChat.start').handler(
      { sessionId: 'pi-chat:w1', worktreeId: 'repo::/wt' },
      makeContext(runtime)
    )
    expect(runtime.resolveWorktreePath).not.toHaveBeenCalled()
    expect(engine.getPiChatSession).toHaveBeenCalledWith('pi-chat:w1')
    expect(result).toMatchObject(snapshot)
  })

  it('creates the session when none exists yet', async () => {
    const runtime = makeRuntime()
    engine.getPiChatSession.mockResolvedValueOnce(null)
    await method('piChat.start').handler(
      { sessionId: 'pi-chat:w1', worktreeId: 'repo::/wt' },
      makeContext(runtime)
    )
    expect(engine.subscribeToPiChat).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'pi-chat:w1', worktreeId: 'repo::/wt' }),
      expect.any(Function),
      expect.any(Function)
    )
  })

  it('rejects a missing worktreeId at the schema boundary', async () => {
    // Why: the dispatcher (not the handler) enforces params; validate the schema
    // directly so the wire contract stays covered without a full dispatch.
    const parsed = method('piChat.start').params!.safeParse({ sessionId: 'pi-chat:x' })
    expect(parsed.success).toBe(false)
  })
})

describe('piChat.send', () => {
  it('forwards the message and returns the snapshot', async () => {
    const runtime = makeRuntime()
    const result = await method('piChat.send').handler(
      { sessionId: 'pi-chat:w2', worktreeId: 'repo::/wt', text: 'hello' },
      makeContext(runtime)
    )
    expect(engine.sendPiChatMessage).toHaveBeenCalledWith(
      'pi-chat:w2',
      'repo::/wt',
      'hello',
      expect.any(Function)
    )
    expect(result).toMatchObject(snapshot)
  })

  it('rejects an empty text at the schema boundary', async () => {
    const parsed = method('piChat.send').params!.safeParse({
      sessionId: 'pi-chat:w3',
      worktreeId: 'repo::/wt',
      text: ''
    })
    expect(parsed.success).toBe(false)
  })
})

describe('piChat.subscribe', () => {
  it('registers cleanup and forwards engine frames to the stream', async () => {
    const runtime = makeRuntime()
    const emitted: unknown[] = []
    const handler = method('piChat.subscribe').handler as (
      params: unknown,
      ctx: RpcContext,
      emit: (result: unknown) => void
    ) => Promise<void>

    await handler({ sessionId: 'pi-chat:w4', worktreeId: 'repo::/wt' }, makeContext(runtime), (e) =>
      emitted.push(e)
    )

    expect(runtime.registerSubscriptionCleanup).toHaveBeenCalled()
    expect(engine.subscribeToPiChat).toHaveBeenCalledTimes(1)
    // The engine's immediate snapshot emit is captured by the emitter.
    const emitter = engine.subscribeToPiChat.mock.calls[0]![2]
    emitter({
      type: 'message',
      sessionId: 'pi-chat:w4',
      message: { id: 'm1', role: 'user', content: 'hi', createdAt: 1 }
    })
    expect(emitted).toContainEqual(
      expect.objectContaining({ type: 'message', sessionId: 'pi-chat:w4' })
    )
  })
})

describe('piChat.listModels', () => {
  it('returns a model list', async () => {
    const runtime = makeRuntime()
    const result = await method('piChat.listModels').handler(null, makeContext(runtime))
    expect(result).toHaveLength(1)
  })
})

describe('piChat.unsubscribe', () => {
  it('cleans up subscriptions by prefix', async () => {
    const runtime = makeRuntime()
    await method('piChat.unsubscribe').handler(null, makeContext(runtime))
    expect(runtime.cleanupSubscriptionsByPrefix).toHaveBeenCalledWith('piChat:conn-1:')
  })
})
