import { describe, expect, it } from 'vitest'
import {
  resolveStrandsApiKey,
  resolveStrandsModelId,
  resolveStrandsOpenAiBaseUrl,
  resolveStrandsProvider,
  STRANDS_DEFAULT_OPENAI_BASE_URL,
  STRANDS_DEFAULT_OPENAI_MODEL
} from './strands-model-config'

describe('strands model config', () => {
  it('defaults openai proxy + locked flash model when proxy key is present', () => {
    const env = {
      ORCA_STRANDS_API_KEY: 'test-key'
    } as NodeJS.ProcessEnv
    expect(resolveStrandsProvider(undefined, env)).toBe('openai')
    expect(resolveStrandsModelId('openai', null, env)).toBe(STRANDS_DEFAULT_OPENAI_MODEL)
    expect(resolveStrandsOpenAiBaseUrl(env)).toBe(STRANDS_DEFAULT_OPENAI_BASE_URL)
    expect(resolveStrandsApiKey('openai', env)).toBe('test-key')
  })

  it('honors explicit model override and base URL', () => {
    const env = {
      ORCA_STRANDS_MODEL: 'other/model',
      ORCA_STRANDS_BASE_URL: 'https://example.com/v1',
      OPENAI_API_KEY: 'sk-openai'
    } as NodeJS.ProcessEnv
    expect(resolveStrandsModelId('openai', null, env)).toBe('other/model')
    expect(resolveStrandsModelId('openai', 'cline2/deepseek/deepseek-v4-flash', env)).toBe(
      'cline2/deepseek/deepseek-v4-flash'
    )
    expect(resolveStrandsOpenAiBaseUrl(env)).toBe('https://example.com/v1')
    expect(resolveStrandsApiKey('openai', env)).toBe('sk-openai')
  })
})
