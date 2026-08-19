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

  try {
    await agentSession.prompt(args.spec)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = agentSession.messages ?? []
    // Why: the final assistant message carries the completed breakdown; text
    // blocks are the only content we persist to the task result.
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m?.role !== 'assistant') {
        continue
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = (m.blocks ?? []).find((b: any) => b.type === 'text')?.text ?? ''
      if (text.trim()) {
        return { result: text.trim(), modelId, provider }
      }
    }
    throw new Error('Pi RPC session returned no assistant text')
  } finally {
    try {
      await agentSession.dispose?.()
    } catch {
      // ignore dispose errors
    }
  }
}
