import { useCallback, useEffect, useRef, useState } from 'react'
import micWorkletUrl from '../voice/mic-worklet.mjs?url'

/**
 * Hands-free microphone for the voice-call panel: always-listening capture that
 * streams 16 kHz PCM chunks straight to Gemini Live and lets the worklet's
 * energy VAD decide when an utterance ends (silence => auto-send). No local STT
 * and no push-to-talk — Gemini transcribes the audio and the session dispatches
 * the finalized utterance as a turn.
 *
 * The worklet is the tuned capture/VAD core ported from the gemini-live harness:
 * it resamples to 16 kHz, gates on energy, and posts `audio` / `streamEnd`.
 */
export function useVoiceMic({ callId }: { callId: string | null }) {
  const [listening, setListening] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const listeningRef = useRef(false)

  const stop = useCallback((): void => {
    listeningRef.current = false
    setListening(false)
    setLevel(0)
    try {
      nodeRef.current?.port.close()
    } catch {
      /* ignore */
    }
    try {
      nodeRef.current?.disconnect()
    } catch {
      /* ignore */
    }
    nodeRef.current = null
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop()
    }
    streamRef.current = null
    void ctxRef.current?.close().catch(() => undefined)
    ctxRef.current = null
  }, [])

  const start = useCallback(async (): Promise<void> => {
    if (listeningRef.current || !callId) {
      return
    }
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ac = new Ctor()
      await ac.audioWorklet.addModule(micWorkletUrl)
      const source = ac.createMediaStreamSource(stream)
      const node = new AudioWorkletNode(ac, 'orca-mic-proc')
      node.port.onmessage = (event: MessageEvent): void => {
        const d = (event.data ?? {}) as { kind?: string; level?: number; data?: string }
        if (d.kind === 'vumeter') {
          setLevel(Math.min(1, (d.level ?? 0) * 12))
        } else if (d.kind === 'audio' && d.data) {
          window.api.voiceCall.sendAudioChunk(callId, d.data)
        } else if (d.kind === 'streamEnd') {
          window.api.voiceCall.sendAudioStreamEnd(callId)
        }
      }
      source.connect(node)
      // An AudioWorkletNode only runs while its output is connected; route it to
      // a muted gain so the graph stays alive without feeding anything (and
      // never echoing Gemini's own audio back into the mic).
      const silent = ac.createGain()
      silent.gain.value = 0
      node.connect(silent)
      silent.connect(ac.destination)
      ctxRef.current = ac
      streamRef.current = stream
      nodeRef.current = node
      listeningRef.current = true
      setListening(true)
    } catch {
      stop()
      setError('Mic tidak bisa dibuka (izin / perangkat?).')
    }
  }, [callId, stop])

  const toggle = useCallback((): void => {
    if (listeningRef.current) {
      stop()
    } else {
      void start()
    }
  }, [start, stop])

  useEffect(() => stop, [stop])

  return {
    listening,
    level,
    error,
    start,
    stop,
    toggle,
    clearError: (): void => setError(null)
  }
}
