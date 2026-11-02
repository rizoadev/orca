import WebSocket from 'ws'

const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.' +
  'v1beta.GenerativeService.BidiGenerateContent'

export type GeminiLiveHandlers = {
  onReady?: () => void
  onTranscript?: (text: string, final: boolean) => void
  onUserTranscript?: (text: string) => void
  onAudio?: (dataBase64: string, sampleRate: number) => void
  onTurnComplete?: () => void
  onError?: (error: Error) => void
  onClose?: (code: number, reason: string) => void
}

export type GeminiLiveOptions = {
  apiKey: string
  model?: string
  voice?: string
  systemInstruction?: string
}

const DEFAULT_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-exp'
const DEFAULT_SYSTEM_INSTRUCTION =
  'Kamu adalah asisten suara Google Gemini Live yang standby mendampingi software developer. ' +
  'Tugas utamamu adalah mendengarkan prompt pengguna yang nantinya otomatis dikirim ke terminal Pi CLI. ' +
  'Jawab dengan sangat singkat dan natural dalam Bahasa Indonesia (maksimal 1 kalimat).'

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
            inputTranscription?: { text?: string }
            outputTranscription?: { text?: string }
            modelTurn?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] }
            turnComplete?: boolean
          }
        | undefined
      if (!content) {
        return
      }
      const inText = content.inputTranscription?.text
      if (inText) {
        this.handlers.onUserTranscript?.(inText)
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
    socket.on('close', (code: number, reason: Buffer) => {
      this.ready = false
      const reasonText = reason ? reason.toString('utf8') : ''
      this.handlers.onClose?.(code, reasonText)
    })
  }

  sendText(text: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.ready) {
      return false
    }
    this.socket.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true
        }
      })
    )
    return true
  }

  sendAudioChunk(base64Pcm16k: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.ready) {
      return false
    }
    this.socket.send(
      JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ data: base64Pcm16k, mimeType: 'audio/pcm;rate=16000' }]
        }
      })
    )
    return true
  }

  sendAudioStreamEnd(): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.ready) {
      return false
    }
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
