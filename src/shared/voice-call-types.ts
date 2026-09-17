/**
 * Wire types for the right-sidebar Voice Call tab: a real-time audio
 * conversation (Gemini Live or OpenAI Realtime) that can delegate coding
 * work to the in-process Pi SDK agent, mirroring the ack → work → report
 * flow of the standalone test harness.
 */
import type { PiIssueChatEvent } from './pi-issue-chat-types'

/** Which real-time audio provider to use. */
export type VoiceCallProvider = 'gemini' | 'openai'

export type VoiceCallStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'working'
  | 'error'

export type VoiceCallSendArgs = {
  /** The user's utterance (from mic STT or typed text). */
  text: string
  /** When true, run the coding flow: provider ack → Pi SDK task → provider report. */
  coding: boolean
  /** Worktree + cwd for the Pi coding task (ignored when coding is false). */
  worktreeId?: string
  cwd?: string
  /** Pi SDK model ref for the coding task. */
  piModelRef?: string
}

export type VoiceCallStartArgs = {
  /** Which real-time audio provider to use. */
  provider?: VoiceCallProvider
  /** Voice name (prebuilt name per provider: e.g. "Leda" for Gemini, "alloy" for OpenAI). */
  voice?: string
}

/** Hands-free mode + context the mic path uses to dispatch a transcribed
 *  utterance as chat or a Pi coding turn. */
export type VoiceCallContext = {
  coding: boolean
  cwd?: string
  piModelRef?: string
}

/** Provider key status — which providers have API keys configured. */
export type VoiceCallKeyStatus = {
  gemini: boolean
  openai: boolean
}

/** A Pi SDK progress event surfaced inside the voice panel while coding. */
export type VoiceCallEvent =
  | { type: 'status'; status: VoiceCallStatus; error?: string }
  /** Live caption of what the user said (mic STT) or typed. */
  | { type: 'userTranscript'; text: string }
  /** Agent's spoken reply, streamed as text (output transcription). */
  | { type: 'agentTranscript'; text: string; final: boolean }
  /** A base64 PCM16 mono audio chunk (24 kHz). */
  | { type: 'audioChunk'; data: string; sampleRate: number }
  /** Agent finished speaking its current turn. */
  | { type: 'turnComplete' }
  /** Raw Pi SDK event stream while a coding task runs — the panel reduces it
   *  with the same logic as the issue-chat panel so reasoning/tools render
   *  identically (live spoiler + grouped tool chips). */
  | { type: 'piEvent'; event: PiIssueChatEvent }
  /** Final coding report text (also fed back to the provider for a spoken summary). */
  | { type: 'report'; text: string }
