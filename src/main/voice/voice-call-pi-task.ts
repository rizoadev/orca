import type { PiIssueChatEvent } from '../../shared/pi-issue-chat-types'
import { piLog } from '../pi/pi-session-factory'
import {
  getPiIssueChatSession,
  sendPiIssueChatMessage,
  startPiIssueChatSession,
  stopPiIssueChatSession
} from '../pi/issue-chat-session'

export async function runPiCodingTask(
  sessionId: string,
  modelRefUsed: string,
  task: string,
  opts: { cwd?: string; piModelRef?: string },
  onEvent: (event: PiIssueChatEvent) => void
): Promise<{ report: string; modelRefUsed: string }> {
  const cwd = opts.cwd?.trim()
  if (!cwd) {
    return { report: 'Tidak ada workspace aktif untuk menjalankan coding task.', modelRefUsed }
  }
  let currentModelRef = modelRefUsed
  try {
    const desiredRef = opts.piModelRef?.trim() ?? ''
    if (getPiIssueChatSession(sessionId) && desiredRef !== currentModelRef) {
      stopPiIssueChatSession(sessionId)
    }
    await startPiIssueChatSession(
      {
        sessionId,
        cwd,
        issueContext: 'You are the Orca voice-call coding agent. Be concise.',
        ...(desiredRef ? { modelRef: desiredRef } : {})
      },
      onEvent
    )
    currentModelRef = desiredRef
    await sendPiIssueChatMessage(sessionId, task, onEvent)
    const snap = getPiIssueChatSession(sessionId)
    const lastAssistant = (snap?.messages ?? []).toReversed().find((m) => m.role === 'assistant')
    return {
      report: lastAssistant?.content?.trim() || 'Task selesai tanpa ringkasan.',
      modelRefUsed: currentModelRef
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    piLog('voice pi error', message)
    return { report: `Coding task gagal: ${message}`, modelRefUsed: currentModelRef }
  }
}
