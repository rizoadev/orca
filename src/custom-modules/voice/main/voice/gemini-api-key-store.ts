import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const GEMINI_TOKEN_FILE = 'gemini-live-token.enc'
const GEMINI_PLAIN_FILE = 'gemini-live-token.txt'
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

function getEncPath(): string {
  return join(getOrcaDir(), GEMINI_TOKEN_FILE)
}

function getPlainPath(): string {
  return join(getOrcaDir(), GEMINI_PLAIN_FILE)
}

export function hasGeminiApiKey(): boolean {
  if (process.env.GEMINI_API_KEY?.trim()) {
    return true
  }
  return existsSync(getEncPath()) || existsSync(getPlainPath())
}

export function saveGeminiApiKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) {
    throw new Error('Gemini API key is required')
  }
  ensureOrcaDir()
  cached = trimmed

  // Save via safeStorage if available, otherwise plaintext file
  try {
    if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(getEncPath(), safeStorage.encryptString(trimmed), { mode: 0o600 })
      // If encrypted save succeeds, remove any old plaintext file
      rmSync(getPlainPath(), { force: true })
      return
    }
  } catch (err) {
    console.warn('[voice] safeStorage encryption error, falling back to durable file:', err)
  }

  // Fallback durable write to ~/.orca/gemini-live-token.txt
  writeFileSync(getPlainPath(), trimmed, { encoding: 'utf8', mode: 0o600 })
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

  // 1. Try reading encrypted file
  const encPath = getEncPath()
  if (existsSync(encPath)) {
    try {
      const raw = readFileSync(encPath)
      if (safeStorage.isEncryptionAvailable()) {
        cached = safeStorage.decryptString(raw)
        return cached
      }
    } catch {
      // If decryption fails, check fallback
    }
  }

  // 2. Try reading plaintext fallback file
  const plainPath = getPlainPath()
  if (existsSync(plainPath)) {
    try {
      const val = readFileSync(plainPath, 'utf8').trim()
      if (val) {
        cached = val
        return val
      }
    } catch {
      /* ignore */
    }
  }

  throw new Error('Gemini API key belum dikonfigurasi. Masukkan API key di panel Voice.')
}

export function clearGeminiApiKey(): void {
  cached = null
  rmSync(getEncPath(), { force: true })
  rmSync(getPlainPath(), { force: true })
}
