/**
 * Persistent OpenAI API key storage for the Voice Call feature.
 * Key is stored encrypted in ~/.orca/ alongside the Gemini key.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const SALT = 'orca-voice-openai-salt'

function getKeyDir(): string {
  return join(process.env.HOME ?? '~', '.orca')
}

function getKeyPath(): string {
  return join(getKeyDir(), 'openai-voice-key.enc')
}

function deriveKey(password: string): Buffer {
  return scryptSync(password, SALT, KEY_LENGTH)
}

function getEncryptionPassword(): string {
  // Use machine-specific identifier as encryption password
  return `orca-${process.getuid?.() ?? process.env.USER ?? 'default'}`
}

export function hasOpenAiApiKey(): boolean {
  return existsSync(getKeyPath()) || Boolean(process.env.OPENAI_API_KEY?.trim())
}

export function saveOpenAiApiKey(apiKey: string): void {
  if (!apiKey?.trim()) {
    throw new Error('OpenAI API key is required')
  }
  const dir = getKeyDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const key = deriveKey(getEncryptionPassword())
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(apiKey.trim(), 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  writeFileSync(getKeyPath(), Buffer.concat([iv, authTag, encrypted]))
}

export function readOpenAiApiKey(): string {
  const envKey = process.env.OPENAI_API_KEY?.trim()
  if (envKey) {
    return envKey
  }
  const path = getKeyPath()
  if (!existsSync(path)) {
    throw new Error('OpenAI API key is not configured')
  }
  try {
    const data = readFileSync(path)
    const key = deriveKey(getEncryptionPassword())
    const iv = data.subarray(0, IV_LENGTH)
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + 16)
    const encrypted = data.subarray(IV_LENGTH + 16)
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8')
  } catch {
    throw new Error('OpenAI API key could not be decrypted')
  }
}

export function clearOpenAiApiKey(): void {
  const path = getKeyPath()
  if (existsSync(path)) {
    unlinkSync(path)
  }
}
