import { ipcMain, type WebContents } from 'electron'
import type {
  VoiceCallEvent,
  VoiceCallSendArgs,
  VoiceCallStartArgs
} from '../../shared/voice-call-types'
import { clearGeminiApiKey, hasGeminiApiKey, saveGeminiApiKey } from '../voice/gemini-api-key-store'
import {
  closeVoiceCall,
  sendVoiceCall,
  startVoiceCall,
  voiceCallSendAudioChunk,
  voiceCallSendAudioStreamEnd,
  voiceCallSetContext,
  voiceCallStop
} from '../voice/voice-call-session'
import type { VoiceCallContext } from '../../shared/voice-call-types'

function emitToSender(sender: WebContents, event: VoiceCallEvent): void {
  if (sender.isDestroyed()) {
    return
  }
  sender.send('voiceCall:event', event)
}

export function registerVoiceCallHandlers(): void {
  ipcMain.handle('voiceCall:getApiKeyStatus', () => ({ configured: hasGeminiApiKey() }))

  ipcMain.handle('voiceCall:saveApiKey', (_event, apiKey: string) => {
    saveGeminiApiKey(String(apiKey ?? ''))
    return { configured: true }
  })

  ipcMain.handle('voiceCall:clearApiKey', () => {
    clearGeminiApiKey()
    return { configured: false }
  })

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
