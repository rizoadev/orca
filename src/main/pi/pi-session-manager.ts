/**
 * Session list, switch, new, and delete helpers for pi issue chat.
 */
import { statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { PiSessionInfo } from '../../shared/pi-issue-chat-types'
import { ISSUE_SESSIONS_DIR_DEFAULT, sessionFileSlug } from './pi-session-factory'
import { importPiSdk } from './pi-session-factory'

export async function listPiIssueSessions(
  cwd: string,
  sessionId: string,
  activeFile?: string
): Promise<PiSessionInfo[]> {
  const { SessionManager } = await importPiSdk()
  const sessionDir = join(ISSUE_SESSIONS_DIR_DEFAULT, sessionFileSlug(sessionId))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any[] = []
  try {
    raw = await SessionManager.list(cwd, sessionDir)
  } catch {
    return []
  }
  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => {
      let createdAt = 0
      try { createdAt = statSync(s.path).mtimeMs } catch { /* ignore */ }
      return {
        path: s.path as string,
        id: s.id as string,
        firstMessage: (s.firstMessage as string | undefined) ?? '',
        createdAt,
        isActive: s.path === activeFile
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function deletePiIssueSession(sessionPath: string): void {
  try { unlinkSync(sessionPath) } catch { /* ignore */ }
}
