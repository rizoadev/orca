/**
 * Model listing and switching helpers for pi issue chat.
 * Kept separate to stay within the max-lines budget of issue-chat-session.ts.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PiModelOption } from '../../shared/pi-issue-chat-types'

/** Read all models from ~/.pi/agent/models.json without SDK auth overhead. */
export function listPiModels(): PiModelOption[] {
  const path = join(homedir(), '.pi', 'agent', 'models.json')
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  const data = JSON.parse(raw) as {
    providers?: Record<
      string,
      { models?: { id?: string; name?: string; contextWindow?: number; maxTokens?: number }[] }
    >
  }
  const result: PiModelOption[] = []
  for (const [providerName, provider] of Object.entries(data.providers ?? {})) {
    for (const m of provider.models ?? []) {
      if (!m.id) {
        continue
      }
      result.push({
        ref: `${providerName}/${m.id}`,
        provider: providerName,
        modelId: m.id,
        name: m.name ?? m.id,
        contextWindow: m.contextWindow ?? 128000,
        maxTokens: m.maxTokens ?? 32000
      })
    }
  }
  return result
}

/**
 * Switch the model on an existing session in-place via session.setModel().
 * Returns the resolved model label "provider/id".
 */
export async function setPiSessionModel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessions: Map<string, { agentSession: any; modelId: string; provider: string }>,
  sessionId: string,
  modelRef: string
): Promise<string> {
  const record = sessions.get(sessionId)
  if (!record) {
    throw new Error('Session not found')
  }

  const { AuthStorage, ModelRegistry } = await import('@earendil-works/pi-coding-agent')
  const authStorage = AuthStorage.create()
  const modelRegistry = ModelRegistry.create(authStorage)

  const slashIdx = modelRef.indexOf('/')
  if (slashIdx === -1) {
    throw new Error(`Invalid modelRef: ${modelRef}`)
  }
  const providerName = modelRef.slice(0, slashIdx)
  const modelId = modelRef.slice(slashIdx + 1)
  const model = modelRegistry.find(providerName, modelId)
  if (!model) {
    throw new Error(`Model not found in registry: ${modelRef}`)
  }

  await record.agentSession.setModel(model)
  record.modelId = model.id
  record.provider = model.provider
  console.log('[pi-chat] model switched to %s/%s', model.provider, model.id)
  return `${model.provider}/${model.id}`
}
