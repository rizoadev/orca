/**
 * Minimal Gemini Live (BidiGenerateContent) client for text-in / audio-out
 * conversation. Mirrors the standalone python harness: send a `setup` frame,
 * wait for `setupComplete`, push `realtimeInput.text`, then read `serverContent`
 * frames for streamed output transcription + inline PCM audio until
 * `turnComplete`. Kept transport-only — orchestration lives in voice-call-session.
 */
import WebSocket from 'ws'

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.' +
  'v1beta.GenerativeService.BidiGenerateContent'

export type GeminiLiveHandlers = {
  onReady?: () => void
  onTranscript?: (text: string, final: boolean) => void
  /** base64 PCM16 mono audio chunk + its sample rate (Gemini returns 24 kHz). */
  onAudio?: (dataBase64: string, sampleRate: number) => void
  onTurnComplete?: () => void
  onError?: (error: Error) => void
  onClose?: () => void
}

export type GeminiLiveOptions = {
  apiKey: string
  model?: string
  voice?: string
  systemInstruction?: string
}

const DEFAULT_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview'
const DEFAULT_SYSTEM_INSTRUCTION =
  'Kamu adalah Gemini Live. Pengguna berbicara Bahasa Indonesia (id-ID). ' +
  'Jawab secara natural dan singkat dengan audio Bahasa Indonesia.'

export class GeminiLiveClient {
  private socket: WebSocket | null = null
  private ready = false

  constructor(
    private readonly opts: GeminiLiveOptions,
    private readonly handlers: GeminiLiveHandlers
  ) {}

  connect(): void {
    const url = `${WS_URL}?key=${encodeURIComponent(this.opts.apiKey)}`
    const socket = new WebSocket(url, { maxPayload: 20 * 1024 * 1024 })
    this.socket = socket

    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          setup: {
            model: `models/${this.opts.model ?? DEFAULT_MODEL}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: this.opts.voice ?? 'Leda' }
                }
              }
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: {
              parts: [{ text: this.opts.systemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION }]
            }
          }
        })
      )
    })

    socket.on('message', (raw: WebSocket.RawData) => {
      let message: Record<string, unknown>
      try {
        message = JSON.parse(raw.toString())
      } catch {
        return
      }
      if ('setupComplete' in message) {
        this.ready = true
        this.handlers.onReady?.()
        return
      }
      const content = message.serverContent as
        | {
            outputTranscription?: { text?: string }
            modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] }
            turnComplete?: boolean
          }
        | undefined
      if (!content) {
        return
      }
      const outText = content.outputTranscription?.text
      if (outText) {
        this.handlers.onTranscript?.(outText, false)
      }
      for (const part of content.modelTurn?.parts ?? []) {
        const inline = part.inlineData
        if (inline?.data && String(inline.mimeType ?? '').startsWith('audio/')) {
          this.handlers.onAudio?.(inline.data, 24000)
        }
      }
      if (content.turnComplete) {
        this.handlers.onTranscript?.('', true)
        this.handlers.onTurnComplete?.()
      }
    })

    socket.on('error', (err: Error) => this.handlers.onError?.(err))
    socket.on('close', () => {
      this.ready = false
      this.handlers.onClose?.()
    })
  }

  /** Send a text turn. No-op until setupComplete has arrived. */
  sendText(text: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.ready) {
      return false
    }
    this.socket.send(JSON.stringify({ realtimeInput: { text } }))
    return true
  }

  close(): void {
    try {
      this.socket?.close()
    } catch {
      /* ignore */
    }
    this.socket = null
    this.ready = false
  }
}
