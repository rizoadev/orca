import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, safeStorage } from 'electron'

// Why: passwords must never persist in plaintext or reach the renderer; this
// store keeps one safeStorage-encrypted blob per target under userData.
const SSH_CREDENTIALS_DIR = 'ssh-credentials'

function credentialsDir(): string {
  const dir = path.join(app.getPath('userData'), SSH_CREDENTIALS_DIR)
  mkdirSync(dir, { recursive: true })
  return dir
}

function credentialPath(targetId: string): string {
  // Why: targetIds are UUIDs in practice, but sanitize defensively before touching the filesystem.
  const safe = targetId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(credentialsDir(), `${safe}.pwd`)
}

export function saveSavedPassword(targetId: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is not available on this system.')
  }
  writeFileSync(credentialPath(targetId), safeStorage.encryptString(value))
}

export function loadSavedPassword(targetId: string): string | undefined {
  try {
    const file = credentialPath(targetId)
    if (!existsSync(file)) {
      return undefined
    }
    const encrypted = readFileSync(file)
    return safeStorage.decryptString(encrypted)
  } catch {
    return undefined
  }
}

export function clearSavedPassword(targetId: string): void {
  try {
    rmSync(credentialPath(targetId), { force: true })
  } catch {
    /* best effort */
  }
}
