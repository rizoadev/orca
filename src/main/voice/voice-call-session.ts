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
  abortPiIssueChatTurn,
  getPiIssueChatSession,
  sendPiIssueChatMessage,
  startPiIssueChatSession,
  stopPiIssueChatSession
} from '../pi/issue-chat-session'
import { ackPrompt, reportPrompt } from './voice-call-prompts'

type Emit = (event: VoiceCallEvent) => void

type VoiceSession = {
  callId: string
  client: GeminiLiveClient
  emit: Emit
  turnWaiters: (() => void)[]
  piSessionId: string
  piModelRefUsed: string
  closed: boolean
  // Hands-free audio-input state: the panel sets the mode/context; the mic
  // worklet streams PCM chunks and a streamEnd finalizes the utterance into a
  // turn once Gemini's input transcription settles.
  coding: boolean
  cwd: string
  piModelRef: string
  transcriptParts: string[]
  settleTimer: ReturnType<typeof setTimeout> | null
  // True while Gemini/Pi is producing a reply. Mic chunks are dropped during a
  // turn so the always-open mic never re-captures Gemini's own voice and loops.
  busy: boolean
  // Bumped on every new turn and on stop; an in-flight runTurn bails once its
  // captured token no longer matches, so Stop / a newer utterance can cancel it.
  turnToken: number
}

const sessions = new Map<string, VoiceSession>()

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
    coding: false,
    cwd: '',
    piModelRef: '',
    transcriptParts: [],
    settleTimer: null,
    busy: false,
    turnToken: 0,
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
      onUserTranscript: (text) => {
        // Each input-transcription event is a new spoken segment; accumulate for
        // dispatch and surface it live as a caption.
        session.transcriptParts.push(text)
        emit({ type: 'userTranscript', text })
      },
      onTurnComplete: () => {
        emit({ type: 'turnComplete' })
        flushTurnWaiters(session)
        if (!session.closed) {
          emit({ type: 'status', status: 'listening' })
        }
      },
      onError: (error) => {
        piLog('voice gemini error', error.message)
        session.busy = false
        flushTurnWaiters(session)
        emit({ type: 'status', status: 'error', error: error.message })
      }
    }
  )
  sessions.set(callId, session)
  emit({ type: 'status', status: 'connecting' })
  session.client.connect()
}

/** Run one conversational turn from resolved text. Shared by the typed path
 *  and the hands-free mic path (which dispatches the transcribed utterance). */
async function runTurn(
  session: VoiceSession,
  text: string,
  opts: { coding: boolean; cwd?: string; piModelRef?: string }
): Promise<void> {
  // A new turn supersedes any in-flight one; Stop bumps the token too. Each
  // await below is followed by a staleness check so an aborted turn stops
  // cleanly instead of marching on to the next stage.
  const myToken = ++session.turnToken
  const stale = (): boolean => session.closed || session.turnToken !== myToken
  session.busy = true

  if (!opts.coding) {
    session.emit({ type: 'status', status: 'thinking' })
    if (!session.client.sendText(text)) {
      session.busy = false
      session.emit({
        type: 'status',
        status: 'error',
        error: 'Gemini Live not ready. Reopen the tab.'
      })
      return
    }
    await waitForTurn(session)
    if (!stale()) {
      session.busy = false
    }
    return
  }

  // ── coding flow: ack → Pi task → spoken report ────────────────────────────
  session.emit({ type: 'status', status: 'thinking' })
  session.client.sendText(ackPrompt(text))
  await waitForTurn(session)
  if (stale()) {
    return
  }

  session.emit({ type: 'status', status: 'working' })
  const report = await runPiCodingTask(session, text, opts)
  if (stale()) {
    return
  }
  session.emit({ type: 'report', text: report })

  session.emit({ type: 'status', status: 'thinking' })
  session.client.sendText(reportPrompt(text, report))
  await waitForTurn(session)
  if (!stale()) {
    session.busy = false
  }
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
  await runTurn(session, text, {
    coding: !!args.coding,
    cwd: args.cwd,
    piModelRef: args.piModelRef
  })
}

/** Force-stop the current/pending turn: cancel a queued dispatch, abort any
 *  running Pi coding task (the warm session stays alive), release the awaiting
 *  turn, and return to listening. Gemini's in-flight audio is dropped client-
 *  side by the panel. */
export function voiceCallStop(callId: string): void {
  const session = sessions.get(callId)
  if (!session || session.closed) {
    return
  }
  session.turnToken += 1
  if (session.settleTimer) {
    clearTimeout(session.settleTimer)
    session.settleTimer = null
  }
  session.transcriptParts = []
  session.busy = false
  try {
    abortPiIssueChatTurn(session.piSessionId)
  } catch {
    /* ignore */
  }
  flushTurnWaiters(session)
  session.emit({ type: 'status', status: 'listening' })
}

/** Set the hands-free mode + context so a mic-driven turn knows whether to
 *  just chat or run a Pi coding task, and against which workspace/model. */
export function voiceCallSetContext(
  callId: string,
  ctx: { coding: boolean; cwd?: string; piModelRef?: string }
): void {
  const session = sessions.get(callId)
  if (!session) {
    return
  }
  session.coding = ctx.coding
  session.cwd = ctx.cwd?.trim() ?? ''
  session.piModelRef = ctx.piModelRef?.trim() ?? ''
}

/** Forward one base64 PCM16 mono 16 kHz mic chunk from the worklet to Gemini. */
export function voiceCallSendAudioChunk(callId: string, base64: string): void {
  const session = sessions.get(callId)
  if (!session || session.closed || session.busy) {
    return
  }
  session.client.sendAudioChunk(base64)
}

/** End the current utterance; after Gemini's transcription settles, dispatch
 *  the accumulated words as a turn (chat or coding per the stored context). */
export function voiceCallSendAudioStreamEnd(callId: string): void {
  const session = sessions.get(callId)
  if (!session || session.closed || session.busy) {
    return
  }
  session.client.sendAudioStreamEnd()
  if (session.settleTimer) {
    clearTimeout(session.settleTimer)
  }
  session.settleTimer = setTimeout(() => {
    session.settleTimer = null
    const text = session.transcriptParts.join(' ').replace(/\s+/g, ' ').trim()
    session.transcriptParts = []
    if (text.length < 3) {
      return
    }
    void runTurn(session, text, {
      coding: session.coding,
      cwd: session.cwd,
      piModelRef: session.piModelRef
    })
  }, 900)
}

async function runPiCodingTask(
  session: VoiceSession,
  task: string,
  opts: { cwd?: string; piModelRef?: string }
): Promise<string> {
  const cwd = opts.cwd?.trim()
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
    const desiredRef = opts.piModelRef?.trim() ?? ''
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
  if (session.settleTimer) {
    clearTimeout(session.settleTimer)
    session.settleTimer = null
  }
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
