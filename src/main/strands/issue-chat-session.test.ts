import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearAllStrandsIssueChatSessionsForTests,
  getStrandsIssueChatSession,
  sendStrandsIssueChatMessage,
  startStrandsIssueChatSession,
  stopStrandsIssueChatSession
} from './issue-chat-session'
import type { StrandsIssueChatEvent } from '../../shared/strands-issue-chat-types'

vi.mock('@strands-agents/sdk', () => {
  class Agent {
    constructor(_config: unknown) {}
    async *stream(prompt: string): AsyncGenerator<{
      type: string
      event?: { type: string; delta?: { type: string; text: string } }
      toolUse?: { name: string }
    }> {
      yield {
        type: 'modelStreamUpdateEvent',
        event: {
          type: 'modelContentBlockDeltaEvent',
          delta: { type: 'textDelta', text: `Echo: ${prompt}` }
        }
      }
      yield {
        type: 'beforeToolCallEvent',
        toolUse: { name: 'bash' }
      }
      yield {
        type: 'modelStreamUpdateEvent',
        event: {
          type: 'modelContentBlockDeltaEvent',
          delta: { type: 'textDelta', text: ' done' }
        }
      }
    }
  }
  return { Agent }
})

vi.mock('@strands-agents/sdk/vended-tools/file-editor', () => ({ fileEditor: {} }))
vi.mock('@strands-agents/sdk/vended-tools/bash', () => ({ bash: {} }))
vi.mock('@strands-agents/sdk/vended-tools/http-request', () => ({ httpRequest: {} }))
vi.mock('@strands-agents/sdk/vended-tools/notebook', () => ({ notebook: {} }))
vi.mock('@strands-agents/sdk/models/anthropic', () => ({
  AnthropicModel: class {
    constructor(_opts: unknown) {}
  }
}))
vi.mock('@strands-agents/sdk/models/openai', () => ({
  OpenAIModel: class {
    constructor(_opts: unknown) {}
  }
}))

describe('strands issue chat session', () => {
  afterEach(() => {
    clearAllStrandsIssueChatSessionsForTests()
    delete process.env.ORCA_STRANDS_PROVIDER
    delete process.env.ANTHROPIC_API_KEY
  })

  it('starts, streams, and records tool + assistant messages', async () => {
    process.env.ORCA_STRANDS_PROVIDER = 'anthropic'
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const events: StrandsIssueChatEvent[] = []
    const emit = (event: StrandsIssueChatEvent): void => {
      events.push(event)
    }

    const started = await startStrandsIssueChatSession(
      {
        sessionId: 'issue-1',
        cwd: '/tmp/repo',
        issueContext: 'Fix login'
      },
      emit
    )
    expect(started.sessionId).toBe('issue-1')
    expect(started.status).toBe('idle')
    expect(getStrandsIssueChatSession('issue-1')?.messages).toEqual([])

    await sendStrandsIssueChatMessage('issue-1', 'hello strands', emit)

    const session = getStrandsIssueChatSession('issue-1')
    expect(session?.status).toBe('idle')
    expect(session?.messages.some((m) => m.role === 'user' && m.content === 'hello strands')).toBe(
      true
    )
    expect(session?.messages.some((m) => m.role === 'tool' && m.toolName === 'bash')).toBe(true)
    const assistant = session?.messages.find((m) => m.role === 'assistant')
    expect(assistant?.content).toContain('Echo: hello strands')
    expect(assistant?.content).toContain('done')
    expect(events.some((e) => e.type === 'status' && e.status === 'running')).toBe(true)
    expect(events.some((e) => e.type === 'status' && e.status === 'idle')).toBe(true)

    stopStrandsIssueChatSession('issue-1')
    expect(getStrandsIssueChatSession('issue-1')).toBeNull()
  })
})
