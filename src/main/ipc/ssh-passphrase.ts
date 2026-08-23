import { ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { SshCredentialKind } from '../ssh/ssh-connection-utils'
import {
  isSshRetainedIdentifier,
  SSH_CREDENTIAL_DETAIL_MAX_UTF8_BYTES
} from '../../shared/ssh-retained-payload-admission'
import { clampUtf8TextPrefix, measureUtf8ByteLength } from '../../shared/utf8-byte-limits'

const CREDENTIAL_TIMEOUT_MS = 120_000
export const SSH_MAX_PENDING_CREDENTIAL_REQUESTS = 64
export const SSH_CREDENTIAL_VALUE_MAX_UTF8_BYTES = 64 * 1024
type PendingRequest = {
  resolve: (value: string | null) => void
  /** Set when the renderer asks to persist this secret; consumed by the caller after resolution. */
  rememberForever?: boolean
}
const pendingRequests = new Map<string, PendingRequest>()

function notifyCredentialResolved(
  getMainWindow: () => BrowserWindow | null,
  requestId: string
): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send('ssh:credential-resolved', { requestId })
    } catch {
      // The SSH caller must still settle if its renderer disappears between checks.
    }
  }
}

export type RequestCredentialOptions = {
  /** Whether the dialog may offer a "save on this computer" checkbox (passwords only). */
  allowRememberSecret?: boolean
  /** Called with the submitted value when the user opted to save it. */
  onRememberSecret?: (value: string) => void
}

export function requestCredential(
  getMainWindow: () => BrowserWindow | null,
  targetId: string,
  kind: SshCredentialKind,
  detail: string,
  options?: RequestCredentialOptions
): Promise<string | null> {
  const win = getMainWindow()
  if (
    !isSshRetainedIdentifier(targetId) ||
    pendingRequests.size >= SSH_MAX_PENDING_CREDENTIAL_REQUESTS ||
    !win ||
    win.isDestroyed()
  ) {
    return Promise.resolve(null)
  }
  const retainedDetail = clampUtf8TextPrefix(detail, SSH_CREDENTIAL_DETAIL_MAX_UTF8_BYTES)
  const requestId = randomUUID()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pendingRequests.delete(requestId)) {
        notifyCredentialResolved(getMainWindow, requestId)
        resolve(null)
      }
    }, CREDENTIAL_TIMEOUT_MS)

    const pendingRequest: PendingRequest = {
      resolve: (value) => {
        clearTimeout(timer)
        if (value !== null && options?.onRememberSecret && pendingRequest.rememberForever) {
          try {
            options.onRememberSecret(value)
          } catch (error) {
            console.warn('[ssh] failed to persist saved credential:', error)
          }
        }
        resolve(value)
      }
    }
    pendingRequests.set(requestId, pendingRequest)

    try {
      win.webContents.send('ssh:credential-request', {
        requestId,
        targetId,
        kind,
        detail: retainedDetail,
        allowRememberSecret: options?.allowRememberSecret === true && kind === 'password'
      })
    } catch {
      pendingRequests.delete(requestId)
      clearTimeout(timer)
      resolve(null)
    }
  })
}

export function registerCredentialHandler(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.removeHandler('ssh:submitCredential')
  ipcMain.handle(
    'ssh:submitCredential',
    (_event, args: { requestId?: unknown; value?: unknown; rememberForever?: unknown }) => {
      if (!args || typeof args !== 'object' || typeof args.requestId !== 'string') {
        return
      }
      const pending = pendingRequests.get(args.requestId)
      if (pending) {
        pendingRequests.delete(args.requestId)
        pending.rememberForever = args.rememberForever === true
        notifyCredentialResolved(getMainWindow, args.requestId)
        const value =
          args.value === null ||
          (typeof args.value === 'string' &&
            !measureUtf8ByteLength(args.value, {
              stopAfterBytes: SSH_CREDENTIAL_VALUE_MAX_UTF8_BYTES
            }).exceededLimit)
            ? args.value
            : null
        pending.resolve(value)
      }
    }
  )
}

export function resetPendingCredentialRequestsForTests(): void {
  const pending = Array.from(pendingRequests.values())
  pendingRequests.clear()
  for (const request of pending) {
    request.resolve(null)
  }
}

export function getPendingCredentialRequestCountForTests(): number {
  return pendingRequests.size
}
