/**
 * Voice-call orchestrator for the right-sidebar tab. Supports both Gemini Live
 * and OpenAI Realtime as the audio conversation backend. Reproduces the
 * standalone harness flow:
 *   chat:   user text → provider audio + transcript
 *   coding: user text → provider "ack" audio → Pi SDK task (tool/reasoning loop)
 *           → final report → provider spoken summary
 *
 * The coding leg reuses the in-process Pi issue-chat session machinery
 * (startPiIssueChatSession / sendPiIssueChatMessage) so tool progress and
 * reasoning stream through the same path the chat panel already uses.
 */
import { randomUUID } from 'node:crypto'
import type {
  VoiceCallEvent,
  VoiceCallProvider,
  VoiceCallSendArgs,
  VoiceCallStartArgs
} from '../../shared/voice-call-types'
import { GeminiLiveClient, type GeminiLiveHandlers } from './gemini-live-client'
import { OpenAiRealtimeClient, type OpenAiRealtimeHandlers } from './openai-realtime-client'
import { readGeminiApiKey } from './gemini-api-key-store'
import { readOpenAiApiKey } from './openai-api-key-store'
import { piLog } from '../pi/pi-session-factory'
import { runPiCodingTask } from './voice-call-pi-task'
import { abortPiIssueChatTurn } from '../pi/issue-chat-session'
import { ackPrompt, reportPrompt } from './voice-call-prompts'

type Emit = (event: VoiceCallEvent) => void

/** A voice client interface that both GeminiLiveClient and OpenAiRealtimeClient satisfy. */
type VoiceClient = {
  connect(): void
  sendText(text: string): boolean
  sendAudioChunk(base64: string): boolean
  sendAudioStreamEnd(): boolean
  close(): void
}

type VoiceSession = {
  callId: string
  provider: VoiceCallProvider
  client: VoiceClient
  emit: Emit
  turnWaiters: (() => void)[]
  piSessionId: string
  piModelRefUsed: string
  closed: boolean
  // Hands-free audio-input state: the panel sets the mode/context; the mic
  // worklet streams PCM chunks and a streamEnd finalizes the utterance into a
  // turn once the provider's input transcription settles.
  coding: boolean
  cwd: string
  piModelRef: string
  transcriptParts: string[]
  settleTimer: ReturnType<typeof setTimeout> | null
  // True while provider/Pi is producing a reply. Mic chunks are dropped during
  // a turn so the always-open mic never re-captures the agent's own voice.
  busy: boolean
  // Bumped on every new turn and on stop; an in-flight runTurn bails once its
  // captured token no longer matches, so Stop / a newer utterance can cancel it.
  turnToken: number
}

const sessions = new Map<string, VoiceSession>()

/** Provider display name for error messages. */
function providerLabel(p: VoiceCallProvider): string {
  return p === 'openai' ? 'OpenAI Realtime' : 'Gemini Live'
}

/** Resolve the next provider turnComplete (or immediately if already closed). */
function waitForTurn(session: VoiceSession): Promise<void> {
  return new Promise((resolve) => session.turnWaiters.push(resolve))
}

function flushTurnWaiters(session: VoiceSession): void {
  const waiters = session.turnWaiters.splice(0)
  for (const resolve of waiters) {
    resolve()
  }
}

function buildSessionCallbacks(session: VoiceSession): GeminiLiveHandlers & OpenAiRealtimeHandlers {
  return {
    onReady: () => session.emit({ type: 'status', status: 'listening' }),
    onTranscript: (text, final) => {
      if (text) {
        session.emit({ type: 'agentTranscript', text, final })
      }
    },
    onAudio: (data, sampleRate) => session.emit({ type: 'audioChunk', data, sampleRate }),
    onUserTranscript: (text) => {
      session.transcriptParts.push(text)
      session.emit({ type: 'userTranscript', text })
    },
    onTurnComplete: () => {
      session.emit({ type: 'turnComplete' })
      flushTurnWaiters(session)
      if (!session.closed) {
        session.emit({ type: 'status', status: 'listening' })
      }
    },
    onError: (error) => {
      piLog(`voice ${session.provider} error`, error.message)
      session.busy = false
      flushTurnWaiters(session)
      session.emit({ type: 'status', status: 'error', error: error.message })
    }
  }
}

export function startVoiceCall(callId: string, args: VoiceCallStartArgs, emit: Emit): void {
  closeVoiceCall(callId)
  const provider: VoiceCallProvider = args.provider ?? 'gemini'

  let apiKey: string
  try {
    apiKey = provider === 'openai' ? readOpenAiApiKey() : readGeminiApiKey()
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
    provider,
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
    client: null as unknown as VoiceClient
  }

  const callbacks = buildSessionCallbacks(session)

  session.client =
    provider === 'openai'
      ? new OpenAiRealtimeClient({ apiKey, voice: args.voice ?? 'alloy' }, callbacks)
      : new GeminiLiveClient({ apiKey, voice: args.voice ?? 'Leda' }, callbacks)

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
  const myToken = ++session.turnToken
  const stale = (): boolean => session.closed || session.turnToken !== myToken
  session.busy = true
  const label = providerLabel(session.provider)

  if (!opts.coding) {
    session.emit({ type: 'status', status: 'thinking' })
    if (!session.client.sendText(text)) {
      session.busy = false
      session.emit({
        type: 'status',
        status: 'error',
        error: `${label} not ready. Reopen the tab.`
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
  const { report, modelRefUsed } = await runPiCodingTask(
    session.piSessionId,
    session.piModelRefUsed,
    text,
    opts,
    (event) => session.emit({ type: 'piEvent', event })
  )
  session.piModelRefUsed = modelRefUsed
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
 *  turn, and return to listening. Provider in-flight audio is dropped
 *  client-side by the panel. */
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

/** Forward one base64 PCM16 mono 16 kHz mic chunk from the worklet. */
export function voiceCallSendAudioChunk(callId: string, base64: string): void {
  const session = sessions.get(callId)
  if (!session || session.closed || session.busy) {
    return
  }
  session.client.sendAudioChunk(base64)
}

/** End the current utterance; after the provider's transcription settles,
 *  dispatch the accumulated words as a turn (chat or coding). */
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
