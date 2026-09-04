import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioCapture } from './use-audio-capture'
import { useAppStore } from '../store'

/**
 * Push-to-talk microphone → local STT for the voice-call panel.
 *
 * Why buffered capture: the STT worker takes seconds to spin up, so we record
 * into a local buffer first and flush it once dictation is live — otherwise the
 * first words are dropped. On stop we wait for the final transcript (the worker
 * only emits it after stopDictation flushes) and fall back to the last partial
 * if it never arrives, so a turn is never silently lost.
 */
export function useVoiceMic({
  sessionId,
  onFinal
}: {
  sessionId: string
  onFinal: (text: string) => void
}) {
  const sttModel = useAppStore((s) => s.settings?.voice?.sttModel)
  const voiceEnabled = useAppStore((s) => s.settings?.voice?.enabled)
  const { start: startCapture, stop: stopCapture, flushBufferedAudio } = useAudioCapture()

  const [listening, setListening] = useState(false)
  const [partial, setPartial] = useState('')
  const [error, setError] = useState<string | null>(null)

  const listeningRef = useRef(false)
  const lastTextRef = useRef('')
  const resolveFinalRef = useRef<((text: string) => void) | null>(null)
  const cleanupsRef = useRef<(() => void)[]>([])

  const teardownListeners = useCallback(() => {
    for (const off of cleanupsRef.current) {
      off()
    }
    cleanupsRef.current = []
  }, [])

  const stop = useCallback(async () => {
    if (!listeningRef.current) {
      return
    }
    listeningRef.current = false
    setListening(false)
    stopCapture()
    const finalPromise = new Promise<string>((resolve) => {
      resolveFinalRef.current = resolve
    })
    await window.api.speech.stopDictation(sessionId).catch(() => undefined)
    // Give the worker a beat to emit the final transcript after the flush.
    const text = await Promise.race([
      finalPromise,
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 1500))
    ])
    resolveFinalRef.current = null
    teardownListeners()
    const utterance = (text || lastTextRef.current).trim()
    setPartial('')
    lastTextRef.current = ''
    if (utterance) {
      onFinal(utterance)
    } else {
      setError('Tidak ada suara terdeteksi.')
    }
  }, [onFinal, sessionId, stopCapture, teardownListeners])

  const start = useCallback(async () => {
    if (listeningRef.current) {
      return
    }
    if (!sttModel || !voiceEnabled) {
      setError('Aktifkan Voice & pilih STT model di Settings > Voice untuk input mic.')
      return
    }
    setError(null)
    setPartial('')
    lastTextRef.current = ''
    listeningRef.current = true
    setListening(true)

    cleanupsRef.current.push(
      window.api.speech.onPartialTranscript((data) => {
        if (data.sessionId !== sessionId) {
          return
        }
        lastTextRef.current = data.text
        setPartial(data.text)
      }),
      window.api.speech.onFinalTranscript((data) => {
        if (data.sessionId !== sessionId) {
          return
        }
        lastTextRef.current = data.text
        resolveFinalRef.current?.(data.text)
      })
    )

    try {
      await startCapture({ bufferAudio: true, sessionId })
      await window.api.speech.startDictation(sttModel, undefined, sessionId)
      await flushBufferedAudio()
    } catch {
      teardownListeners()
      listeningRef.current = false
      setListening(false)
      stopCapture()
      await window.api.speech.stopDictation(sessionId).catch(() => undefined)
      setError('Mic tidak bisa dibuka (izin / perangkat?).')
    }
  }, [
    flushBufferedAudio,
    sessionId,
    startCapture,
    stopCapture,
    sttModel,
    teardownListeners,
    voiceEnabled
  ])

  const toggle = useCallback((): void => {
    if (listeningRef.current) {
      void stop()
    } else {
      void start()
    }
  }, [start, stop])

  useEffect(() => {
    return () => {
      teardownListeners()
      if (listeningRef.current) {
        stopCapture()
        void window.api.speech.stopDictation(sessionId).catch(() => undefined)
      }
    }
  }, [sessionId, stopCapture, teardownListeners])

  return { listening, partial, error, start, stop, toggle, clearError: () => setError(null) }
}
