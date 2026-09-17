import { ipcMain, type WebContents } from 'electron'
import type {
  VoiceCallEvent,
  VoiceCallKeyStatus,
  VoiceCallSendArgs,
  VoiceCallStartArgs
} from '../../shared/voice-call-types'
import type { VoiceCallContext } from '../../shared/voice-call-types'
import { clearGeminiApiKey, hasGeminiApiKey, saveGeminiApiKey } from '../voice/gemini-api-key-store'
import { clearOpenAiApiKey, hasOpenAiApiKey, saveOpenAiApiKey } from '../voice/openai-api-key-store'
import {
  closeVoiceCall,
  sendVoiceCall,
  startVoiceCall,
  voiceCallSendAudioChunk,
  voiceCallSendAudioStreamEnd,
  voiceCallSetContext,
  voiceCallStop
} from '../voice/voice-call-session'

function emitToSender(sender: WebContents, event: VoiceCallEvent): void {
  if (sender.isDestroyed()) {
    return
  }
  sender.send('voiceCall:event', event)
}

export function registerVoiceCallHandlers(): void {
  // ── Gemini key ─────────────────────────────────────────────────────────────
  ipcMain.handle('voiceCall:getGeminiKeyStatus', () => ({ configured: hasGeminiApiKey() }))

  ipcMain.handle('voiceCall:saveGeminiApiKey', (_event, apiKey: string) => {
    saveGeminiApiKey(String(apiKey ?? ''))
    return { configured: true }
  })

  ipcMain.handle('voiceCall:clearGeminiApiKey', () => {
    clearGeminiApiKey()
    return { configured: false }
  })

  // ── OpenAI key ─────────────────────────────────────────────────────────────
  ipcMain.handle('voiceCall:getOpenAiKeyStatus', () => ({ configured: hasOpenAiApiKey() }))

  ipcMain.handle('voiceCall:saveOpenAiApiKey', (_event, apiKey: string) => {
    saveOpenAiApiKey(String(apiKey ?? ''))
    return { configured: true }
  })

  ipcMain.handle('voiceCall:clearOpenAiApiKey', () => {
    clearOpenAiApiKey()
    return { configured: false }
  })

  // ── Combined key status ────────────────────────────────────────────────────
  ipcMain.handle(
    'voiceCall:getKeyStatus',
    (): VoiceCallKeyStatus => ({
      gemini: hasGeminiApiKey(),
      openai: hasOpenAiApiKey()
    })
  )

  // ── Session control ────────────────────────────────────────────────────────
  ipcMain.handle('voiceCall:start', (event, callId: string, args: VoiceCallStartArgs) => {
    if (typeof callId !== 'string' || !callId) {
      return
    }
    startVoiceCall(callId, args ?? {}, (payload) => emitToSender(event.sender, payload))
  })

  ipcMain.handle('voiceCall:send', async (_event, callId: string, args: VoiceCallSendArgs) => {
    if (typeof callId !== 'string' || !callId) {
      return
    }
    await sendVoiceCall(callId, args)
  })

  ipcMain.handle('voiceCall:close', (_event, callId: string) => {
    if (typeof callId === 'string' && callId) {
      closeVoiceCall(callId)
    }
  })

  ipcMain.handle('voiceCall:stop', (_event, callId: string) => {
    if (typeof callId === 'string' && callId) {
      voiceCallStop(callId)
    }
  })

  ipcMain.handle('voiceCall:setContext', (_event, callId: string, ctx: VoiceCallContext) => {
    if (typeof callId === 'string' && callId) {
      voiceCallSetContext(callId, ctx)
    }
  })

  // High-frequency, fire-and-forget: use `on` (not `handle`) so the renderer
  // never awaits a promise per ~500 ms audio frame.
  ipcMain.on('voiceCall:audioChunk', (_event, callId: string, base64: string) => {
    if (typeof callId === 'string' && callId && typeof base64 === 'string') {
      voiceCallSendAudioChunk(callId, base64)
    }
  })

  ipcMain.on('voiceCall:audioStreamEnd', (_event, callId: string) => {
    if (typeof callId === 'string' && callId) {
      voiceCallSendAudioStreamEnd(callId)
    }
  })
}
