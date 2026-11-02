import { useCallback, useEffect, useRef, useState } from 'react'
import micWorkletUrl from '../voice/mic-worklet.mjs?url'

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
          window.api?.voiceCall?.sendAudioChunk(callId, d.data)
        } else if (d.kind === 'streamEnd') {
          window.api?.voiceCall?.sendAudioStreamEnd(callId)
        }
      }
      source.connect(node)
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
      setError('Mic tidak bisa diakses (cek izin mikrofon).')
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
