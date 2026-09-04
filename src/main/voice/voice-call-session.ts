/**
 * Voice-call orchestrator for the right-sidebar tab. Owns one Gemini Live
 * connection per call and reproduces the standalone harness flow:
 *   chat:   user text → Gemini audio + transcript
 *   coding: user text → Gemini "ack" audio → Pi SDK task (tool/reasoning loop)
 *           → final report → Gemini spoken summary
 *
 * The coding leg reuses the in-process Pi issue-chat session machinery
 * (startPiIssueChatSession / sendPiIssueChatMessage) so tool progress and
 * reasoning stream through the same path the chat panel already uses.
 */
import { randomUUID } from 'node:crypto'
import type {
  VoiceCallEvent,
  VoiceCallSendArgs,
  VoiceCallStartArgs
} from '../../shared/voice-call-types'
import type { PiIssueChatEvent } from '../../shared/pi-issue-chat-types'
import { GeminiLiveClient } from './gemini-live-client'
import { readGeminiApiKey } from './gemini-api-key-store'
import { piLog } from '../pi/pi-session-factory'
import {
  getPiIssueChatSession,
  sendPiIssueChatMessage,
  startPiIssueChatSession,
  stopPiIssueChatSession
} from '../pi/issue-chat-session'

type Emit = (event: VoiceCallEvent) => void

type VoiceSession = {
  callId: string
  client: GeminiLiveClient
  emit: Emit
  turnWaiters: (() => void)[]
  piSessionId: string
  piModelRefUsed: string
  closed: boolean
}

const sessions = new Map<string, VoiceSession>()

// Why: a fixed instruction yields a canned-sounding acknowledgement. Feeding
// the real task + asking for variety lets Gemini Live produce a natural, varied
// ack each time instead of the same "Baik, aku akan cek…" every turn.
function ackPrompt(task: string): string {
  return (
    '[CODING_ACK] User baru saja menugaskan coding task ini: ' +
    `"${task.slice(0, 400)}".\n` +
    'Ucapkan acknowledgement singkat (1 kalimat, Bahasa Indonesia lisan) bahwa kamu ' +
    'akan langsung mengerjakannya. Variasikan gaya bahasamu setiap kali — natural, ' +
    'hangat, jangan kaku, dan jangan mengulang kalimat yang sama persis dengan ' +
    'sebelumnya. Boleh singgung sekilas apa yang akan kamu kerjakan. Jangan mengklaim ' +
    'sudah selesai dan jangan menyebut tool internal.'
  )
}

function reportPrompt(task: string, report: string): string {
  return (
    '[PI_CODING_REPORT]\n' +
    `Task user: ${task}\n` +
    `Report Pi SDK: ${report.slice(0, 14000)}\n` +
    'Laporkan hasilnya dalam Bahasa Indonesia secara singkat berdasarkan report ini.'
  )
}

/** Resolve the next Gemini turnComplete (or immediately if already closed). */
function waitForTurn(session: VoiceSession): Promise<void> {
  return new Promise((resolve) => session.turnWaiters.push(resolve))
}

function flushTurnWaiters(session: VoiceSession): void {
  const waiters = session.turnWaiters.splice(0)
  for (const resolve of waiters) {
    resolve()
  }
}

export function startVoiceCall(callId: string, args: VoiceCallStartArgs, emit: Emit): void {
  closeVoiceCall(callId)
  let apiKey: string
  try {
    apiKey = readGeminiApiKey()
  } catch (error) {
    emit({
      type: 'status',
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    })
    return
  }

  const session: VoiceSession = {
    callId,
    emit,
    turnWaiters: [],
    piSessionId: `voice:${callId}`,
    piModelRefUsed: '',
    closed: false,
    // placeholder; replaced below once handlers can reference the session
    client: null as unknown as GeminiLiveClient
  }

  session.client = new GeminiLiveClient(
    { apiKey, voice: args.voice },
    {
      onReady: () => emit({ type: 'status', status: 'listening' }),
      onTranscript: (text, final) => {
        if (text) {
          emit({ type: 'geminiTranscript', text, final })
        }
      },
      onAudio: (data, sampleRate) => emit({ type: 'audioChunk', data, sampleRate }),
      onTurnComplete: () => {
        emit({ type: 'turnComplete' })
        flushTurnWaiters(session)
        if (!session.closed) {
          emit({ type: 'status', status: 'listening' })
        }
      },
      onError: (error) => {
        piLog('voice gemini error', error.message)
        emit({ type: 'status', status: 'error', error: error.message })
      }
    }
  )
  sessions.set(callId, session)
  emit({ type: 'status', status: 'connecting' })
  session.client.connect()
}

export async function sendVoiceCall(callId: string, args: VoiceCallSendArgs): Promise<void> {
  const session = sessions.get(callId)
  if (!session || session.closed) {
    return
  }
  const text = args.text.trim()
  if (!text) {
    return
  }
  session.emit({ type: 'userTranscript', text })

  if (!args.coding) {
    session.emit({ type: 'status', status: 'thinking' })
    if (!session.client.sendText(text)) {
      session.emit({
        type: 'status',
        status: 'error',
        error: 'Gemini Live not ready. Reopen the tab.'
      })
    }
    return
  }

  // ── coding flow: ack → Pi task → spoken report ────────────────────────────
  session.emit({ type: 'status', status: 'thinking' })
  session.client.sendText(ackPrompt(text))
  await waitForTurn(session)

  session.emit({ type: 'status', status: 'working' })
  const report = await runPiCodingTask(session, text, args)
  if (session.closed) {
    return
  }
  session.emit({ type: 'report', text: report })

  session.emit({ type: 'status', status: 'thinking' })
  session.client.sendText(reportPrompt(text, report))
  await waitForTurn(session)
}

async function runPiCodingTask(
  session: VoiceSession,
  task: string,
  args: VoiceCallSendArgs
): Promise<string> {
  const cwd = args.cwd?.trim()
  if (!cwd) {
    return 'Tidak ada workspace aktif untuk menjalankan coding task.'
  }
  const piEmit = (event: PiIssueChatEvent): void => {
    // Forward the raw Pi event stream; the panel reduces it exactly like the
    // issue-chat panel so reasoning/tools render identically.
    session.emit({ type: 'piEvent', event })
  }
  try {
    // A warm Pi session bakes its model at creation, so switching the selected
    // model means tearing down and recreating it; otherwise reuse it so tool /
    // reasoning events keep streaming to this panel across turns.
    const desiredRef = args.piModelRef?.trim() ?? ''
    if (getPiIssueChatSession(session.piSessionId) && desiredRef !== session.piModelRefUsed) {
      stopPiIssueChatSession(session.piSessionId)
    }
    // startPiIssueChatSession re-attaches the emitter when the session is
    // already warm, so calling it every turn keeps progress events flowing.
    await startPiIssueChatSession(
      {
        sessionId: session.piSessionId,
        cwd,
        issueContext: 'You are the Orca voice-call coding agent. Be concise.',
        ...(desiredRef ? { modelRef: desiredRef } : {})
      },
      piEmit
    )
    session.piModelRefUsed = desiredRef
    await sendPiIssueChatMessage(session.piSessionId, task, piEmit)
    const snap = getPiIssueChatSession(session.piSessionId)
    const lastAssistant = (snap?.messages ?? []).toReversed().find((m) => m.role === 'assistant')
    return lastAssistant?.content?.trim() || 'Task selesai tanpa ringkasan.'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    piLog('voice pi error', message)
    return `Coding task gagal: ${message}`
  }
}

export function closeVoiceCall(callId: string): void {
  const session = sessions.get(callId)
  if (!session) {
    return
  }
  session.closed = true
  session.client.close()
  flushTurnWaiters(session)
  sessions.delete(callId)
}

export function getVoiceCallSessionForTests(callId: string): VoiceSession | undefined {
  return sessions.get(callId)
}

export function newCallId(): string {
  return randomUUID()
}
