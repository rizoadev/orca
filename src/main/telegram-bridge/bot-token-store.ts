import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCanonicalUserDataPath } from '../persistence'

const TOKEN_FILE = 'telegram-bridge-bot-token.enc'
let cachedToken: string | null | undefined

function getTokenPath(): string {
  return join(getCanonicalUserDataPath(), TOKEN_FILE)
}

export function hasTelegramBotToken(): boolean {
  return existsSync(getTokenPath())
}

export function saveTelegramBotToken(token: string): void {
  const trimmed = token.trim()
  if (!trimmed) {
    throw new Error('Telegram bot token is required')
  }
  const dir = getCanonicalUserDataPath()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(getTokenPath(), safeStorage.encryptString(trimmed), { mode: 0o600 })
  } else {
    console.warn(
      '[telegram-bridge] safeStorage encryption unavailable — storing bot token in plaintext'
    )
    writeFileSync(getTokenPath(), trimmed, { encoding: 'utf8', mode: 0o600 })
  }
  cachedToken = trimmed
}

export function readTelegramBotToken(): string | null {
  if (cachedToken !== undefined) {
    return cachedToken
  }
  const path = getTokenPath()
  if (!existsSync(path)) {
    cachedToken = null
    return null
  }
  try {
    const raw = readFileSync(path)
    cachedToken = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString('utf8')
    return cachedToken
  } catch {
    console.warn('[telegram-bridge] bot token decrypt failed')
    cachedToken = null
    return null
  }
}

export function clearTelegramBotToken(): void {
  cachedToken = null
  rmSync(getTokenPath(), { force: true })
}
