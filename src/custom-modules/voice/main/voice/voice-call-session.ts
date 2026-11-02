import type { VoiceCallEvent, VoiceCallStartArgs } from '../../../../shared/voice-call-types'
import { GeminiLiveClient, type GeminiLiveHandlers } from './gemini-live-client'
import { readGeminiApiKey } from './gemini-api-key-store'

type Emit = (event: VoiceCallEvent) => void

type VoiceSession = {
  callId: string
  client: GeminiLiveClient
  emit: Emit
  closed: boolean
  transcriptParts: string[]
  settleTimer: NodeJS.Timeout | null
  busy: boolean
  lastError: string | null
}

const sessions = new Map<string, VoiceSession>()

function buildSessionCallbacks(session: VoiceSession): GeminiLiveHandlers {
  return {
    onReady: () => {
      session.emit({ type: 'status', status: 'listening' })
    },
    onUserTranscript: (text) => {
      if (!text) {
        return
      }
      session.transcriptParts.push(text)
      session.emit({ type: 'userTranscript', text })
      // Auto-reset settle timer on speech updates
      if (session.settleTimer) {
        clearTimeout(session.settleTimer)
      }
      session.settleTimer = setTimeout(() => {
        finalizeUtterance(session)
      }, 1200)
    },
    onTranscript: (text, final) => {
      if (text) {
        session.emit({ type: 'agentTranscript', text, final })
      }
    },
    onAudio: (data, sampleRate) => {
      session.emit({ type: 'audioChunk', data, sampleRate })
    },
    onTurnComplete: () => {
      session.emit({ type: 'turnComplete' })
      if (!session.closed) {
        session.emit({ type: 'status', status: 'listening' })
      }
    },
    onError: (error) => {
      console.error('[voice-call] Gemini error:', error.message)
      session.busy = false
      let msg = error.message
      if (msg.includes('403') || msg.includes('leaked') || msg.includes('PERMISSION_DENIED')) {
        msg =
          'API key terdeteksi bocor/leaked dan diblokir oleh Google. Harap generate key baru di Google AI Studio (aistudio.google.com).'
      }
      session.lastError = msg
      session.emit({ type: 'status', status: 'error', error: msg })
    },
    onClose: (code, reason) => {
      if (session.closed) {
        return
      }
      if (code !== 1000 && code !== 1005) {
        let msg = reason || `Koneksi Google Gemini ditutup (kode ${code}).`
        if (code === 1008) {
          msg = `Google menolak koneksi (kode 1008): ${
            reason ||
            'Kemungkinan API key tidak valid, kuota habis, atau key diblokir karena terdeteksi bocor di chat/publik.'
          }`
        }
        session.lastError = msg
        session.emit({ type: 'status', status: 'error', error: msg })
        return
      }
      if (!session.lastError) {
        session.emit({ type: 'status', status: 'idle' })
      }
    }
  }
}

function finalizeUtterance(session: VoiceSession): void {
  session.settleTimer = null
  const text = session.transcriptParts.join(' ').replace(/\s+/g, ' ').trim()
  session.transcriptParts = []
  if (text.length >= 2) {
    // Emit finalized utterance! This triggers the auto-write to active Pi CLI terminal
    session.emit({ type: 'userUtteranceFinal', text })
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
    closed: false,
    transcriptParts: [],
    settleTimer: null,
    busy: false,
    lastError: null,
    client: null as unknown as GeminiLiveClient
  }

  const callbacks = buildSessionCallbacks(session)
  session.client = new GeminiLiveClient(
    {
      apiKey,
      voice: args.voice ?? 'Leda',
      systemInstruction: args.systemInstruction
    },
    callbacks
  )

  sessions.set(callId, session)
  emit({ type: 'status', status: 'connecting' })
  session.client.connect()
}

export function voiceCallSendText(callId: string, text: string): void {
  const session = sessions.get(callId)
  if (!session || session.closed) {
    return
  }
  const trimmed = text.trim()
  if (!trimmed) {
    return
  }
  session.emit({ type: 'userUtteranceFinal', text: trimmed })
  session.client.sendText(trimmed)
}

export function voiceCallSendAudioChunk(callId: string, base64: string): void {
  const session = sessions.get(callId)
  if (!session || session.closed) {
    return
  }
  session.client.sendAudioChunk(base64)
}

export function voiceCallSendAudioStreamEnd(callId: string): void {
  const session = sessions.get(callId)
  if (!session || session.closed) {
    return
  }
  session.client.sendAudioStreamEnd()
  if (session.settleTimer) {
    clearTimeout(session.settleTimer)
  }
  session.settleTimer = setTimeout(() => {
    finalizeUtterance(session)
  }, 900)
}

export function voiceCallStop(callId: string): void {
  const session = sessions.get(callId)
  if (!session || session.closed) {
    return
  }
  if (session.settleTimer) {
    clearTimeout(session.settleTimer)
    session.settleTimer = null
  }
  session.transcriptParts = []
  session.busy = false
  session.emit({ type: 'status', status: 'listening' })
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
  sessions.delete(callId)
}
