import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff, Phone, Send, TerminalSquare, Volume2, KeyRound } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { VoiceCallTranscript, type VoiceCallLogEntry } from './voice-call-transcript'
import { reducePiEvent } from './pi-chat-reduce'
import { useAudioPlayback } from '../../hooks/use-audio-playback'
import { useVoiceMic } from '../../hooks/use-voice-mic'
import { useAppStore } from '../../store'
import { splitWorktreeIdForFilesystem } from '../../../../shared/worktree-id'
import type { VoiceCallEvent, VoiceCallStatus } from '../../../../shared/voice-call-types'
import type { PiModelOption } from '../../../../shared/pi-issue-chat-types'
import { cn } from '../../lib/utils'

const STATUS_LABEL: Record<VoiceCallStatus, string> = {
  idle: 'Idle',
  connecting: 'Menghubungkan…',
  listening: 'Siap',
  thinking: 'Gemini berpikir…',
  speaking: 'Gemini bicara…',
  working: 'Pi SDK mengerjakan…',
  error: 'Error'
}

// Gemini Live prebuilt voices; Leda is the house default (matches the harness).
const VOICE_OPTIONS = [
  'Leda',
  'Aoede',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Orus',
  'Enceladus',
  'Iapetus',
  'Umbriel'
]

let entrySeq = 0
function nextId(): string {
  entrySeq += 1
  return `vc-${entrySeq}`
}

export function VoiceCallPanel(): React.JSX.Element {
  const callIdRef = useRef<string>(`voice-call-${Math.random().toString(36).slice(2)}`)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const cwd = useMemo(
    () =>
      activeWorktreeId ? splitWorktreeIdForFilesystem(activeWorktreeId)?.worktreePath : undefined,
    [activeWorktreeId]
  )

  const [status, setStatus] = useState<VoiceCallStatus>('idle')
  const [log, setLog] = useState<VoiceCallLogEntry[]>([])
  const [input, setInput] = useState('')
  const [codingMode, setCodingMode] = useState(true)
  const [rate, setRate] = useState(1)
  const [voice, setVoice] = useState('Leda')
  const [piModels, setPiModels] = useState<PiModelOption[]>([])
  // Why: default the coding model to the same one the issue-chat panel uses so
  // reasoning streams live out-of-the-box; a non-streaming default (cb/kimi-k3)
  // would deliver thinking as one block at the end instead of token-by-token.
  const [piModel, setPiModel] = useState(
    () =>
      useAppStore.getState().settings?.agentDefaultEnv?.['strands']?.['ORCA_STRANDS_MODEL'] ?? ''
  )
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null)
  const [keyInput, setKeyInput] = useState('')

  const { enqueue, stop: stopPlayback } = useAudioPlayback(rate)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const appendEntry = useCallback((entry: VoiceCallLogEntry) => {
    setLog((prev) => [...prev, entry])
  }, [])

  // ── Gemini Live event stream ──────────────────────────────────────────────
  useEffect(() => {
    const off = window.api.voiceCall.onEvent((event: VoiceCallEvent) => {
      switch (event.type) {
        case 'status':
          setStatus(event.status)
          if (event.status === 'working') {
            setLog((prev) => [
              ...prev,
              { id: nextId(), role: 'pi', messages: [], status: 'running' }
            ])
          }
          break
        case 'userTranscript':
          appendEntry({ id: nextId(), role: 'user', text: event.text, streaming: false })
          break
        case 'geminiTranscript':
          setLog((prev) => {
            const last = prev.at(-1)
            if (last && last.role === 'gemini' && last.streaming) {
              const merged = { ...last, text: last.text + event.text, streaming: !event.final }
              return [...prev.slice(0, -1), merged]
            }
            return [
              ...prev,
              { id: nextId(), role: 'gemini', text: event.text, streaming: !event.final }
            ]
          })
          break
        case 'audioChunk':
          enqueue(event.data, event.sampleRate)
          setStatus('speaking')
          break
        case 'turnComplete':
          // Why: turnComplete means Gemini finished *sending*, not that the
          // playback queue drained. Stopping here cuts off the tail of the
          // spoken reply, so let the scheduled audio finish on its own.
          break
        case 'piEvent': {
          const ev = event.event
          setLog((prev) => {
            let idx = -1
            for (let i = prev.length - 1; i >= 0; i -= 1) {
              if (prev[i]!.role === 'pi') {
                idx = i
                break
              }
            }
            if (idx === -1) {
              const r = reducePiEvent([], 'running', ev)
              return [...prev, { id: nextId(), role: 'pi', messages: r.messages, status: r.status }]
            }
            const entry = prev[idx] as Extract<VoiceCallLogEntry, { role: 'pi' }>
            const r = reducePiEvent(entry.messages, entry.status, ev)
            const updated: VoiceCallLogEntry = { ...entry, messages: r.messages, status: r.status }
            return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)]
          })
          break
        }
        case 'report':
          appendEntry({ id: nextId(), role: 'report', text: event.text, streaming: false })
          break
      }
    })
    return off
  }, [appendEntry, enqueue, stopPlayback])

  // ── key gate + connect ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    void window.api.voiceCall.getApiKeyStatus().then((s) => {
      if (!cancelled) {
        setKeyConfigured(s.configured)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!keyConfigured) {
      return
    }
    const id = callIdRef.current
    void window.api.voiceCall.start(id, { voice })
    return () => {
      void window.api.voiceCall.close(id)
    }
    // Voice is baked into the Live setup frame, so changing it reconnects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyConfigured, voice])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [log])

  // Load the Pi SDK model list once so the coding leg's model is selectable.
  useEffect(() => {
    let cancelled = false
    void window.api.piIssueChat.listModels().then((models) => {
      if (!cancelled) {
        setPiModels(models)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) {
        return
      }
      setInput('')
      void window.api.voiceCall.send(callIdRef.current, {
        text: trimmed,
        coding: codingMode,
        ...(activeWorktreeId ? { worktreeId: activeWorktreeId } : {}),
        ...(cwd ? { cwd } : {}),
        ...(piModel ? { piModelRef: piModel } : {})
      })
    },
    [activeWorktreeId, codingMode, cwd, piModel]
  )

  // ── mic → STT → send (push-to-talk) ───────────────────────────────────────
  const mic = useVoiceMic({
    sessionId: 'voice-call',
    onFinal: (text) => {
      send(text)
    }
  })
  const toggleMic = useCallback(() => {
    if (!mic.listening) {
      stopPlayback()
    }
    mic.toggle()
  }, [mic, stopPlayback])

  const saveKey = useCallback(() => {
    const trimmed = keyInput.trim()
    if (!trimmed) {
      return
    }
    void window.api.voiceCall.saveApiKey(trimmed).then(() => {
      setKeyInput('')
      setKeyConfigured(true)
    })
  }, [keyInput])

  if (keyConfigured === false) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <KeyRound className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Masukkan Gemini API key untuk mengaktifkan Voice Call. Key disimpan terenkripsi di
          <code className="mx-1 rounded bg-muted px-1">~/.orca</code>.
        </p>
        <div className="flex w-full max-w-sm items-center gap-2">
          <Input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="AIza…"
            className="h-8 text-xs"
          />
          <Button size="sm" onClick={saveKey} disabled={!keyInput.trim()}>
            Simpan
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-medium text-foreground">Voice Call</span>
          <span
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px]',
              status === 'error'
                ? 'bg-destructive/15 text-destructive'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            aria-label="Gemini voice"
            className="h-6 rounded border border-border bg-transparent px-1 text-[10px] text-muted-foreground focus:outline-none"
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={piModel}
            onChange={(e) => setPiModel(e.target.value)}
            aria-label="Pi SDK model"
            title="Model Pi SDK untuk coding task"
            className="h-6 max-w-[8rem] truncate rounded border border-border bg-transparent px-1 text-[10px] text-muted-foreground focus:outline-none"
          >
            <option value="">Pi: default</option>
            {piModels.map((m) => (
              <option key={m.ref} value={m.ref}>
                {m.name}
              </option>
            ))}
          </select>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={codingMode ? 'default' : 'ghost'}
                className="h-6 w-6"
                onClick={() => setCodingMode((v) => !v)}
              >
                <TerminalSquare className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {codingMode ? 'Coding mode: ON (Pi SDK)' : 'Coding mode: OFF (chat saja)'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setRate((r) => (r >= 1.5 ? 1 : +(r + 0.1).toFixed(1)))}
              >
                <Volume2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Kecepatan bicara: {rate.toFixed(1)}×</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* transcript */}
      <VoiceCallTranscript log={log} scrollRef={scrollRef} />

      {/* composer */}
      <div className="shrink-0 border-t border-border p-2">
        {mic.error ? (
          <div className="mb-1.5 flex items-center justify-between gap-2 rounded bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
            <span>{mic.error}</span>
            <button className="shrink-0 underline" onClick={mic.clearError}>
              tutup
            </button>
          </div>
        ) : mic.listening ? (
          <div className="mb-1.5 truncate px-1 text-[10px] text-muted-foreground">
            {mic.partial ? `“${mic.partial}”` : 'Mendengar…'}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant={mic.listening ? 'destructive' : 'ghost'}
                className="h-8 w-8 shrink-0"
                onClick={toggleMic}
              >
                {mic.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{mic.listening ? 'Stop & kirim' : 'Bicara'}</TooltipContent>
          </Tooltip>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder={codingMode ? 'Perintah coding untuk Pi…' : 'Ketik ke Gemini…'}
            className="h-8 flex-1 text-sm"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => send(input)}
            disabled={!input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default VoiceCallPanel
