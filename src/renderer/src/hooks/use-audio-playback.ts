import { useCallback, useEffect, useRef } from 'react'

/**
 * Streams base64 PCM16 mono chunks from Gemini Live into a Web Audio playback
 * queue. Chunks are appended back-to-back so speech is continuous; playbackRate
 * mirrors the harness's local speed-up without touching the source samples.
 * Cross-platform by design — no external player (paplay/ffplay) needed.
 */
export function useAudioPlayback(rate: number) {
  const contextRef = useRef<AudioContext | null>(null)
  // Next scheduled start time keeps chunks gapless.
  const nextTimeRef = useRef(0)
  const sourcesRef = useRef<AudioBufferSourceNode[]>([])
  const rateRef = useRef(rate)
  rateRef.current = rate

  const ensureContext = useCallback((): AudioContext => {
    if (!contextRef.current || contextRef.current.state === 'closed') {
      contextRef.current = new AudioContext()
      nextTimeRef.current = 0
    }
    if (contextRef.current.state === 'suspended') {
      void contextRef.current.resume()
    }
    return contextRef.current
  }, [])

  const enqueue = useCallback(
    (base64: string, sampleRate: number): void => {
      const ctx = ensureContext()
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2))
      if (int16.length === 0) {
        return
      }
      const float = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i += 1) {
        float[i] = int16[i]! / 32768
      }
      const buffer = ctx.createBuffer(1, float.length, sampleRate)
      buffer.copyToChannel(float, 0)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = rateRef.current
      source.connect(ctx.destination)
      const startAt = Math.max(ctx.currentTime, nextTimeRef.current)
      source.start(startAt)
      nextTimeRef.current = startAt + buffer.duration / rateRef.current
      sourcesRef.current.push(source)
      source.onended = () => {
        sourcesRef.current = sourcesRef.current.filter((s) => s !== source)
      }
    },
    [ensureContext]
  )

  const stop = useCallback((): void => {
    for (const source of sourcesRef.current) {
      try {
        source.stop()
      } catch {
        /* already ended */
      }
    }
    sourcesRef.current = []
    nextTimeRef.current = 0
  }, [])

  useEffect(() => {
    return () => {
      stop()
      if (contextRef.current && contextRef.current.state !== 'closed') {
        void contextRef.current.close()
      }
      contextRef.current = null
    }
  }, [stop])

  return { enqueue, stop }
}
