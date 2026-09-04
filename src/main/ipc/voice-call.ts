import { ipcMain, type WebContents } from 'electron'
import type {
  VoiceCallEvent,
  VoiceCallSendArgs,
  VoiceCallStartArgs
} from '../../shared/voice-call-types'
import { clearGeminiApiKey, hasGeminiApiKey, saveGeminiApiKey } from '../voice/gemini-api-key-store'
import { closeVoiceCall, sendVoiceCall, startVoiceCall } from '../voice/voice-call-session'

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
}
