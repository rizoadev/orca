/**
 * Voice Call types for Google Gemini Live standby & streaming to active Pi CLI.
 * Custom module: src/custom-modules/voice/
 */

export type VoiceCallStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error'

export type VoiceCallStartArgs = {
  voice?: string
  systemInstruction?: string
}

export type VoiceCallKeyStatus = {
  gemini: boolean
  maskedKey?: string
}

export type VoiceCallEvent =
  | { type: 'status'; status: VoiceCallStatus; error?: string }
  /** Live transcription partial of what the user is saying. */
  | { type: 'userTranscript'; text: string }
  /** Finalized transcription of what the user said after utterance settles (silence VAD). */
  | { type: 'userUtteranceFinal'; text: string }
  /** Live / finalized spoken transcription from Gemini. */
  | { type: 'agentTranscript'; text: string; final: boolean }
  /** Base64 PCM16 audio chunk from Gemini (24 kHz mono). */
  | { type: 'audioChunk'; data: string; sampleRate: number }
  /** Turn completed. */
  | { type: 'turnComplete' }

export type VoiceCallApi = {
  getKeyStatus: () => Promise<VoiceCallKeyStatus>
  saveGeminiApiKey: (key: string) => Promise<{ configured: boolean }>
  clearGeminiApiKey: () => Promise<{ configured: boolean }>
  start: (callId: string, args?: VoiceCallStartArgs) => Promise<void>
  stop: (callId: string) => Promise<void>
  close: (callId: string) => Promise<void>
  sendText: (callId: string, text: string) => Promise<void>
  sendAudioChunk: (callId: string, base64: string) => void
  sendAudioStreamEnd: (callId: string) => void
  onEvent: (handler: (event: VoiceCallEvent) => void) => () => void
}
