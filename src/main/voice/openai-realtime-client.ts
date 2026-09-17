/**
 * OpenAI Realtime API client (GA) for text-in / audio-out conversation.
 * Mirrors the GeminiLiveClient interface: connect, sendText, sendAudioChunk,
 * sendAudioStreamEnd, close. Uses the OpenAI Realtime WebSocket endpoint
 * wss://api.openai.com/v1/realtime?model=<model>.
 *
 * The model must be specified as a URL query parameter — it is NOT accepted
 * inside session.update. The old `OpenAI-Beta: realtime=v1` header is no
 * longer needed (GA API).
 */
import WebSocket from 'ws'

const WS_BASE = 'wss://api.openai.com/v1/realtime'

export type OpenAiRealtimeHandlers = {
  onReady?: () => void
  onTranscript?: (text: string, final: boolean) => void
  onUserTranscript?: (text: string) => void
  onAudio?: (dataBase64: string, sampleRate: number) => void
  onTurnComplete?: () => void
  onError?: (error: Error) => void
  onClose?: () => void
}

export type OpenAiRealtimeOptions = {
  apiKey: string
  model?: string
  voice?: string
  systemInstruction?: string
}

const DEFAULT_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-1.5'
const DEFAULT_VOICE = 'alloy'

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are a helpful voice assistant. The user speaks Bahasa Indonesia (id-ID). ' +
  'Reply naturally and concisely in Bahasa Indonesia.'

export class OpenAiRealtimeClient {
  private socket: WebSocket | null = null
  private ready = false
  constructor(
    private readonly opts: OpenAiRealtimeOptions,
    private readonly handlers: OpenAiRealtimeHandlers
  ) {}

  connect(): void {
    const model = this.opts.model ?? DEFAULT_MODEL
    const wsUrl = `${WS_BASE}?model=${encodeURIComponent(model)}`
    const socket = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`
        // No OpenAI-Beta header — GA API
      },
      maxPayload: 20 * 1024 * 1024
    })
    this.socket = socket

    socket.on('open', () => {
      // session.update configures voice, modalities, instructions, etc.
      // Model is set via URL query param and must NOT be repeated here.
      socket.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            voice: this.opts.voice ?? DEFAULT_VOICE,
            modalities: ['text', 'audio'],
            instructions: this.opts.systemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 800
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

      const type = message.type as string | undefined

      switch (type) {
        case 'session.created':
        case 'session.updated': {
          this.ready = true
          this.handlers.onReady?.()
          break
        }

        case 'conversation.item.input_audio_transcription.completed': {
          const text = (message.transcript as string) ?? ''
          if (text) {
            this.handlers.onUserTranscript?.(text)
          }
          break
        }

        case 'response.audio_transcript.delta': {
          const delta = (message.delta as string) ?? ''
          if (delta) {
            this.handlers.onTranscript?.(delta, false)
          }
          break
        }

        case 'response.audio_transcript.done': {
          this.handlers.onTranscript?.('', true)
          break
        }

        case 'response.audio.delta': {
          const audioData = (message.delta as string) ?? ''
          if (audioData) {
            // OpenAI Realtime returns 24kHz PCM16 audio
            this.handlers.onAudio?.(audioData, 24000)
          }
          break
        }

        case 'response.audio.done': {
          // Audio response fully delivered; not the same as turnComplete.
          break
        }

        case 'response.done': {
          this.handlers.onTurnComplete?.()
          break
        }

        case 'error': {
          const errData = message.error as { message?: string } | undefined
          this.handlers.onError?.(new Error(errData?.message ?? 'Unknown OpenAI error'))
          break
        }
      }
    })

    socket.on('error', (err: Error) => this.handlers.onError?.(err))
    socket.on('close', () => {
      this.ready = false
      this.handlers.onClose?.()
    })
  }

  /** Send a text turn. No-op until session is ready. */
  sendText(text: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.ready) {
      return false
    }
    // Create a conversation item with text input, then trigger a response
    this.socket.send(
      JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }]
        }
      })
    )
    this.socket.send(JSON.stringify({ type: 'response.create' }))
    return true
  }

  /** Stream a base64 PCM16 mono 16kHz mic chunk. */
  sendAudioChunk(base64Pcm16k: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.ready) {
      return false
    }
    this.socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64Pcm16k }))
    return true
  }

  /** Commit the audio buffer so OpenAI processes the mic utterance. */
  sendAudioStreamEnd(): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.ready) {
      return false
    }
    this.socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
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
