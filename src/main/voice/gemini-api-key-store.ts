import { safeStorage } from 'electron'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readIntegrationCredentialFileSync } from '../integration-credential-file'

const GEMINI_TOKEN_FILE = 'gemini-live-token.enc'
let cached: string | null = null

function getOrcaDir(): string {
  return join(homedir(), '.orca')
}

function ensureOrcaDir(): void {
  const dir = getOrcaDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function getKeyPath(): string {
  return join(getOrcaDir(), GEMINI_TOKEN_FILE)
}

export function hasGeminiApiKey(): boolean {
  // Why: existence check avoids decrypting safeStorage (and a macOS keychain
  // prompt) on every settings refresh.
  return existsSync(getKeyPath()) || Boolean(process.env.GEMINI_API_KEY?.trim())
}

export function saveGeminiApiKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) {
    throw new Error('Gemini API key is required')
  }
  ensureOrcaDir()
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(getKeyPath(), safeStorage.encryptString(trimmed), { mode: 0o600 })
  } else {
    console.warn('[voice] safeStorage unavailable — storing Gemini key in plaintext')
    writeFileSync(getKeyPath(), trimmed, { encoding: 'utf8', mode: 0o600 })
  }
  cached = trimmed
}

export function readGeminiApiKey(): string {
  if (cached !== null) {
    return cached
  }
  const envKey = process.env.GEMINI_API_KEY?.trim()
  if (envKey) {
    cached = envKey
    return envKey
  }
  const keyPath = getKeyPath()
  if (!existsSync(keyPath)) {
    throw new Error('Gemini API key is not configured')
  }
  try {
    const raw = readIntegrationCredentialFileSync(keyPath)
    cached = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString('utf8')
    return cached
  } catch {
    throw new Error('Gemini API key could not be decrypted')
  }
}

export function clearGeminiApiKey(): void {
  cached = null
  rmSync(getKeyPath(), { force: true })
}
