import { ipcRenderer } from 'electron'
import type {
  VoiceCallApi,
  VoiceCallEvent,
  VoiceCallStartArgs
} from '../../shared/voice-call-types'

export const voiceCallBridge: VoiceCallApi = {
  getKeyStatus: () => ipcRenderer.invoke('voiceCall:getKeyStatus'),
  saveGeminiApiKey: (key: string) => ipcRenderer.invoke('voiceCall:saveGeminiApiKey', key),
  clearGeminiApiKey: () => ipcRenderer.invoke('voiceCall:clearGeminiApiKey'),
  start: (callId: string, args?: VoiceCallStartArgs) =>
    ipcRenderer.invoke('voiceCall:start', callId, args),
  stop: (callId: string) => ipcRenderer.invoke('voiceCall:stop', callId),
  close: (callId: string) => ipcRenderer.invoke('voiceCall:close', callId),
  sendText: (callId: string, text: string) =>
    ipcRenderer.invoke('voiceCall:sendText', callId, text),
  sendAudioChunk: (callId: string, base64: string) =>
    ipcRenderer.send('voiceCall:audioChunk', callId, base64),
  sendAudioStreamEnd: (callId: string) =>
    ipcRenderer.send('voiceCall:audioStreamEnd', callId),
  onEvent: (handler: (event: VoiceCallEvent) => void) => {
    const listener = (_event: unknown, data: VoiceCallEvent) => handler(data)
    ipcRenderer.on('voiceCall:event', listener)
    return () => {
      ipcRenderer.removeListener('voiceCall:event', listener)
    }
  }
}
