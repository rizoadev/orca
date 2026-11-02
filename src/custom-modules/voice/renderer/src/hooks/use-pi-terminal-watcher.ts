/* oxlint-disable no-control-regex */
import { useEffect, useRef } from 'react'

// Strip terminal ANSI escape codes, OSC sequences, and control chars
function cleanTerminalOutput(raw: string): string {
  return raw
    // OSC hyperlinks and titles
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // CSI sequences (color, cursor, etc)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    // Other escape codes
    .replace(/\x1b[@-Z\\-_]/g, '')
    // Carriage returns
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type WatcherOptions = {
  activePtyId?: string
  onPiResponse: (cleanedText: string) => void
}

export function usePiTerminalWatcher({ activePtyId, onPiResponse }: WatcherOptions) {
  const isWatchingRef = useRef(false)
  const bufferRef = useRef('')
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const onResponseRef = useRef(onPiResponse)
  onResponseRef.current = onPiResponse

  // Call this right after sending a prompt to Pi CLI in the terminal
  const markPromptSent = (ptyId?: string): void => {
    if (!ptyId) {
      return
    }
    isWatchingRef.current = true
    bufferRef.current = ''
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => {
    if (!window.api?.pty?.onData) {
      return
    }

    const off = window.api.pty.onData((payload: { id: string; data: string }) => {
      if (!isWatchingRef.current) {
        return
      }
      if (activePtyId && payload.id !== activePtyId) {
        return
      }

      bufferRef.current += payload.data

      // Reset debounce timer on every new chunk from Pi
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      // If no new output for 2200ms, Pi CLI has finished its turn
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        isWatchingRef.current = false
        const cleaned = cleanTerminalOutput(bufferRef.current)
        bufferRef.current = ''

        if (cleaned.length > 5) {
          onResponseRef.current(cleaned)
        }
      }, 2200)
    })

    return () => {
      off?.()
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [activePtyId])

  return { markPromptSent }
}
