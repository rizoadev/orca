import { ipcMain, type WebContents } from 'electron'
import type {
  VoiceCallEvent,
  VoiceCallKeyStatus,
  VoiceCallStartArgs
} from '../../../../shared/voice-call-types'
import {
  clearGeminiApiKey,
  hasGeminiApiKey,
  readGeminiApiKey,
  saveGeminiApiKey
} from '../voice/gemini-api-key-store'
import {
  closeVoiceCall,
  startVoiceCall,
  voiceCallSendAudioChunk,
  voiceCallSendAudioStreamEnd,
  voiceCallSendText,
  voiceCallStop
} from '../voice/voice-call-session'

function emitToSender(sender: WebContents, event: VoiceCallEvent): void {
  if (sender.isDestroyed()) {
    return
  }
  sender.send('voiceCall:event', event)
}

export function registerVoiceCallHandlers(): void {
  ipcMain.removeHandler('voiceCall:getKeyStatus')
  ipcMain.removeHandler('voiceCall:saveGeminiApiKey')
  ipcMain.removeHandler('voiceCall:clearGeminiApiKey')
  ipcMain.removeHandler('voiceCall:start')
  ipcMain.removeHandler('voiceCall:stop')
  ipcMain.removeHandler('voiceCall:close')
  ipcMain.removeHandler('voiceCall:sendText')

  ipcMain.handle('voiceCall:getKeyStatus', (): VoiceCallKeyStatus => {
    const configured = hasGeminiApiKey()
    let maskedKey: string | undefined
    if (configured) {
      try {
        const key = readGeminiApiKey()
        if (key && key.length > 8) {
          maskedKey = `${key.slice(0, 6)}••••${key.slice(-4)}`
        } else if (key) {
          maskedKey = '••••••••'
        }
      } catch {
        /* ignore */
      }
    }
    return {
      gemini: configured,
      maskedKey
    }
  })

  ipcMain.handle('voiceCall:saveGeminiApiKey', (_event, apiKey: string) => {
    saveGeminiApiKey(String(apiKey ?? ''))
    return { configured: true }
  })

  ipcMain.handle('voiceCall:clearGeminiApiKey', () => {
    clearGeminiApiKey()
    return { configured: false }
  })

  ipcMain.handle('voiceCall:start', (event, callId: string, args?: VoiceCallStartArgs) => {
    if (typeof callId !== 'string' || !callId) {
      return
    }
    startVoiceCall(callId, args ?? {}, (payload) => emitToSender(event.sender, payload))
  })

  ipcMain.handle('voiceCall:stop', (_event, callId: string) => {
    if (typeof callId !== 'string' || !callId) {
      return
    }
    voiceCallStop(callId)
  })

  ipcMain.handle('voiceCall:close', (_event, callId: string) => {
    if (typeof callId !== 'string' || !callId) {
      return
    }
    closeVoiceCall(callId)
  })

  ipcMain.handle('voiceCall:sendText', (_event, callId: string, text: string) => {
    if (typeof callId !== 'string' || !callId) {
      return
    }
    voiceCallSendText(callId, text)
  })

  // Fast-path one-way sends for streaming mic PCM audio
  ipcMain.removeAllListeners('voiceCall:audioChunk')
  ipcMain.removeAllListeners('voiceCall:audioStreamEnd')

  ipcMain.on('voiceCall:audioChunk', (_event, callId: string, base64: string) => {
    if (typeof callId !== 'string' || !callId) {
      return
    }
    voiceCallSendAudioChunk(callId, base64)
  })

  ipcMain.on('voiceCall:audioStreamEnd', (_event, callId: string) => {
    if (typeof callId !== 'string' || !callId) {
      return
    }
    voiceCallSendAudioStreamEnd(callId)
  })
}
