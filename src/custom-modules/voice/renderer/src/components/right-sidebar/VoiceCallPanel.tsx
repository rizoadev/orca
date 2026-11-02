import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store'
import { useAudioPlayback } from '../../hooks/use-audio-playback'
import { useVoiceMic } from '../../hooks/use-voice-mic'
import { usePiTerminalWatcher } from '../../hooks/use-pi-terminal-watcher'
import { VoiceCallBubble, type TranscriptEntry } from './voice-call-bubble'
import { VoiceCallControls } from './voice-call-controls'
import type {
  VoiceCallEvent,
  VoiceCallStatus
} from '../../../../../../shared/voice-call-types'

export function VoiceCallPanel(): React.JSX.Element {
  const [callId, setCallId] = useState<string | null>(null)
  const [status, setStatus] = useState<VoiceCallStatus>('idle')
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null)
  const [maskedKey, setMaskedKey] = useState<string>('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKeySetup, setShowKeySetup] = useState(false)
  const [autoSendToTerminal, setAutoSendToTerminal] = useState(true)
  const [autoSpeakPiResponse, setAutoSpeakPiResponse] = useState(true)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [inputText, setInputText] = useState('')

  const activeTabId = useAppStore((s) => s.activeTabId)
  const activePtyId = useAppStore((s) =>
    activeTabId ? s.ptyIdsByTabId[activeTabId]?.[0] : undefined
  )

  const { enqueue: playAudio, stop: stopAudio } = useAudioPlayback(1)
  const {
    listening: micListening,
    level: micLevel,
    start: startMic,
    stop: stopMic
  } = useVoiceMic({ callId })

  const autoSendRef = useRef(autoSendToTerminal)
  autoSendRef.current = autoSendToTerminal

  const autoSpeakRef = useRef(autoSpeakPiResponse)
  autoSpeakRef.current = autoSpeakPiResponse

  const callIdRef = useRef(callId)
  callIdRef.current = callId

  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcript])

  const refreshKeyStatus = useCallback(async (): Promise<void> => {
    try {
      const res = await window.api?.voiceCall?.getKeyStatus()
      setApiKeyConfigured(res?.gemini ?? false)
      setMaskedKey(res?.maskedKey ?? '')
    } catch {
      setApiKeyConfigured(false)
    }
  }, [])

  useEffect(() => {
    void refreshKeyStatus()
  }, [refreshKeyStatus])

  const speakWithGemini = useCallback((textToSummarize: string): void => {
    const currentCallId = callIdRef.current
    if (!currentCallId) {
      return
    }
    const prompt = `Berikut hasil respon dari terminal Pi CLI:\n\n${textToSummarize.slice(
      0,
      1200
    )}\n\nSampaikan ringkasan hasilnya dengan suara secara singkat, padat, dan jelas (1-2 kalimat saja dalam Bahasa Indonesia).`
    void window.api?.voiceCall?.sendText(currentCallId, prompt)
  }, [])

  const handlePiResponse = useCallback(
    (cleanedOutput: string): void => {
      const now = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })

      setTranscript((prev) => [
        ...prev,
        {
          id: `pi-${Date.now()}`,
          role: 'pi',
          text: cleanedOutput,
          timestamp: now
        }
      ])

      toast.info('Pi CLI telah menyelesaikan respon.')

      if (autoSpeakRef.current && callIdRef.current) {
        speakWithGemini(cleanedOutput)
      }
    },
    [speakWithGemini]
  )

  const { markPromptSent } = usePiTerminalWatcher({
    activePtyId,
    onPiResponse: handlePiResponse
  })

  const dispatchToTerminal = useCallback(
    (text: string): boolean => {
      const state = useAppStore.getState()
      const currentTab = state.activeTabId
      const ptyId = currentTab ? state.ptyIdsByTabId[currentTab]?.[0] : undefined

      if (ptyId && window.api?.pty?.writeAccepted) {
        void window.api.pty.writeAccepted(ptyId, `${text}\r`, 'driving')
        markPromptSent(ptyId)
        return true
      }
      return false
    },
    [markPromptSent]
  )

  useEffect(() => {
    if (!window.api?.voiceCall?.onEvent) {
      return
    }
    const off = window.api.voiceCall.onEvent((event: VoiceCallEvent) => {
      switch (event.type) {
        case 'status':
          setStatus(event.status)
          if (event.status === 'listening') {
            void startMic()
          } else if (event.status === 'error' || event.status === 'idle') {
            stopMic()
            if (event.error) {
              toast.error(event.error)
            }
          }
          break

        case 'userUtteranceFinal': {
          const sent = autoSendRef.current ? dispatchToTerminal(event.text) : false
          if (sent) {
            toast.success(`Terkirim ke Pi CLI: "${event.text}"`)
          } else if (autoSendRef.current) {
            toast.warning('Tidak ada terminal aktif untuk menerima prompt.')
          }
          setTranscript((prev) => [
            ...prev,
            {
              id: `user-${Date.now()}`,
              role: 'user',
              text: event.text,
              sentToPty: sent,
              timestamp: new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })
            }
          ])
          break
        }

        case 'agentTranscript':
          setTranscript((prev) => {
            const last = prev.at(-1)
            if (last && last.role === 'gemini') {
              const updated = { ...last, text: `${last.text}${event.text}` }
              return [...prev.slice(0, -1), updated]
            }
            return [
              ...prev,
              {
                id: `gemini-${Date.now()}`,
                role: 'gemini',
                text: event.text,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ]
          })
          break

        case 'audioChunk':
          playAudio(event.data, event.sampleRate)
          break

        case 'turnComplete':
          break
      }
    })

    return () => {
      off()
    }
  }, [dispatchToTerminal, playAudio, startMic, stopMic])

  const startCall = async (): Promise<void> => {
    if (!apiKeyConfigured) {
      setShowKeySetup(true)
      return
    }
    const newId = `voice-${Math.random().toString(36).slice(2, 9)}`
    setCallId(newId)
    setStatus('connecting')
    try {
      await window.api?.voiceCall?.start(newId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memulai koneksi voice')
      setStatus('idle')
    }
  }

  const endCall = async (): Promise<void> => {
    if (callId) {
      stopMic()
      stopAudio()
      await window.api?.voiceCall?.close(callId)
      setCallId(null)
      setStatus('idle')
    }
  }

  const saveKey = async (): Promise<void> => {
    if (!apiKeyInput.trim()) {
      return
    }
    try {
      await window.api?.voiceCall?.saveGeminiApiKey(apiKeyInput.trim())
      setApiKeyInput('')
      setShowKeySetup(false)
      await refreshKeyStatus()
      toast.success('Gemini API key berhasil disimpan permanen!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan key')
    }
  }

  const handleSendManual = (): void => {
    const text = inputText.trim()
    if (!text) {
      return
    }
    setInputText('')
    const sent = dispatchToTerminal(text)
    if (sent) {
      toast.success(`Terkirim ke Pi CLI: "${text}"`)
    }
    setTranscript((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        role: 'user',
        text,
        sentToPty: sent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ])
  }

  const isConnected = status === 'listening' || status === 'speaking' || status === 'thinking'

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <VoiceCallControls
        status={status}
        isConnected={isConnected}
        micListening={micListening}
        micLevel={micLevel}
        apiKeyConfigured={apiKeyConfigured}
        maskedKey={maskedKey}
        apiKeyInput={apiKeyInput}
        showKeySetup={showKeySetup}
        autoSendToTerminal={autoSendToTerminal}
        autoSpeakPiResponse={autoSpeakPiResponse}
        activePtyId={activePtyId}
        hasTranscript={transcript.length > 0}
        onToggleKeySetup={() => setShowKeySetup((v) => !v)}
        onApiKeyInputChange={setApiKeyInput}
        onSaveKey={() => void saveKey()}
        onToggleCall={() => void (isConnected ? endCall() : startCall())}
        onClearTranscript={() => setTranscript([])}
        onToggleAutoSend={setAutoSendToTerminal}
        onToggleAutoSpeak={setAutoSpeakPiResponse}
      />

      {/* Transcript Log */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
        {transcript.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground p-4">
            <Mic className="size-8 stroke-[1.5] mb-2 opacity-50" />
            <p className="font-medium text-foreground mb-1">Google Voice Standby</p>
            <p className="text-[11px] leading-relaxed max-w-[220px]">
              Klik tombol di atas untuk standby. Begitu Anda bicara, suara akan ditranskrip dan
              langsung ditulis ke terminal Pi CLI. Respon Pi akan otomatis dibacakan kembali dengan
              suara Google.
            </p>
          </div>
        ) : (
          transcript.map((item) => (
            <VoiceCallBubble
              key={item.id}
              item={item}
              onResendToPty={dispatchToTerminal}
              onSpeakText={speakWithGemini}
            />
          ))
        )}
      </div>

      {/* Manual Input Footer */}
      <div className="border-t border-border p-2 bg-card">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSendManual()
          }}
          className="flex gap-1.5"
        >
          <Input
            placeholder="Ketik prompt atau bicara…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="h-8 text-xs flex-1"
          />
          <Button type="submit" size="sm" className="h-8 px-2.5" disabled={!inputText.trim()}>
            <Send className="size-3.5" />
          </Button>
        </form>
      </div>
    </div>
  )
}
