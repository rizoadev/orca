/**
 * Shared Strands model defaults for `orca strands` and issue-modal chat.
 * Secrets stay in env / .env.local — never hardcode API keys here.
 */

export type StrandsProvider = 'anthropic' | 'openai' | 'bedrock'

/** Default OpenAI-compatible gateway until in-app model switching exists. */
export const STRANDS_DEFAULT_OPENAI_BASE_URL = 'https://llmproxy.ikamai.com/v1'

/** Locked default model for the issue chat MVP. */
export const STRANDS_DEFAULT_OPENAI_MODEL = 'cline2/deepseek/deepseek-v4-flash'

export function resolveStrandsProvider(
  explicit?: StrandsProvider | null,
  env: NodeJS.ProcessEnv = process.env
): StrandsProvider {
  if (explicit === 'anthropic' || explicit === 'openai' || explicit === 'bedrock') {
    return explicit
  }
  const fromEnv = (env.ORCA_STRANDS_PROVIDER ?? '').trim().toLowerCase()
  if (fromEnv === 'anthropic' || fromEnv === 'openai' || fromEnv === 'bedrock') {
    return fromEnv
  }
  // Why: proxy key is the primary local path; prefer openai-compatible over Bedrock.
  if (env.ORCA_STRANDS_API_KEY?.trim() || env.OPENAI_API_KEY?.trim()) {
    return 'openai'
  }
  if (env.ANTHROPIC_API_KEY?.trim()) {
    return 'anthropic'
  }
  return 'bedrock'
}

export function resolveStrandsApiKey(
  provider: StrandsProvider,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (provider === 'anthropic') {
    return env.ANTHROPIC_API_KEY?.trim() || undefined
  }
  if (provider === 'openai') {
    return env.ORCA_STRANDS_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || undefined
  }
  return undefined
}

export function resolveStrandsOpenAiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (
    env.ORCA_STRANDS_BASE_URL?.trim() ||
    env.OPENAI_BASE_URL?.trim() ||
    STRANDS_DEFAULT_OPENAI_BASE_URL
  )
}

export function resolveStrandsModelId(
  provider: StrandsProvider,
  override?: string | null,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (override?.trim()) {
    return override.trim()
  }
  const fromEnv = env.ORCA_STRANDS_MODEL?.trim()
  if (fromEnv) {
    return fromEnv
  }
  switch (provider) {
    case 'openai':
      return STRANDS_DEFAULT_OPENAI_MODEL
    case 'anthropic':
      return 'claude-sonnet-4-6'
    case 'bedrock':
      return 'global.anthropic.claude-sonnet-4-6'
  }
}
