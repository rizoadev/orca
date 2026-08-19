/**
 * Headless "pi rpc" task runner for pipeline drafting.
 *
 * Instead of spawning a terminal agent, a research/drafting stage is executed
 * by an in-process pi AgentSession (RPC/JSON style): create session, prompt,
 * wait for the full response, return the final assistant text. No TUI window.
 */
import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'
import { createPiSession } from '../../pi/pi-session-factory'

const PIPELINE_SESSIONS_DIR = join(homedir(), '.pi', 'agent', 'sessions', 'orca-pipeline')

export type PiRpcDraftResult = {
  result: string
  modelId: string
  provider: string
}

type SdkEvent = {
  type: string
  assistantMessageEvent?: { type: string; delta?: string; name?: string }
  message?: { role: string; content: { type: string; text?: string }[] }
}

export async function runPiRpcDraftTask(args: {
  cwd: string
  spec: string
  sessionId: string
}): Promise<PiRpcDraftResult> {
  mkdirSync(PIPELINE_SESSIONS_DIR, { recursive: true })
  const { agentSession, modelId, provider } = await createPiSession(
    {
      cwd: args.cwd,
      issueContext: args.spec,
      sessionId: args.sessionId,
      sessionMode: 'new'
    },
    PIPELINE_SESSIONS_DIR
  )

  // Why: the session streams assistant text via events rather than reliably
  // populating messages on the session object, so collect it from the same
  // subscription stream the issue-chat panel uses.
  let collected = ''
  const unsubscribe = agentSession.subscribe((event: SdkEvent) => {
    if (event.type === 'message_update') {
      const inner = event.assistantMessageEvent
      if (inner?.type === 'text_delta' && typeof inner.delta === 'string') {
        collected += inner.delta
      }
      return
    }
    if (
      event.type === 'message_end' &&
      event.message?.role === 'assistant' &&
      Array.isArray(event.message.content)
    ) {
      const text = event.message.content
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text ?? '')
        .join('')
      if (text.trim()) {
        collected = text
      }
    }
  })

  try {
    await agentSession.prompt(args.spec)
    if (!collected.trim()) {
      throw new Error('Pi RPC session returned no assistant text')
    }
    return { result: collected.trim(), modelId, provider }
  } finally {
    try {
      unsubscribe?.()
    } catch {
      // ignore unsub errors
    }
    try {
      await agentSession.dispose?.()
    } catch {
      // ignore dispose errors
    }
  }
}
