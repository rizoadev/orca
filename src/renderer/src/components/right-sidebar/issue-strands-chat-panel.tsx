/**
 * In-modal pi agent chat for issues: message list + composer + model picker + session management.
 * Header and message-list rendering live in sibling components; this module owns
 * session state, the event subscription, and the composer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IssueStrandsChatHeader } from './issue-strands-chat-header'
import { IssueStrandsChatMessages, groupMessagesForRender } from './issue-strands-chat-messages'
import type {
  PiIssueChatEvent,
  PiIssueChatMessage,
  PiIssueChatSessionSnapshot,
  PiIssueChatStatus,
  PiModelOption,
  PiSessionInfo
} from '../../../../shared/pi-issue-chat-types'

export type IssueStrandsChatPanelProps = {
  sessionId: string
  cwd: string
  issueContext: string
  className?: string
}

function upsertMessage(
  messages: PiIssueChatMessage[],
  message: PiIssueChatMessage
): PiIssueChatMessage[] {
  const idx = messages.findIndex((m) => m.id === message.id)
  if (idx >= 0) {
    const next = [...messages]
    next[idx] = message
    return next
  }
  return [...messages, message]
}

export function IssueStrandsChatPanel({
  sessionId,
  cwd,
  issueContext,
  className
}: IssueStrandsChatPanelProps): React.JSX.Element {
  const [status, setStatus] = useState<PiIssueChatStatus>('idle')
  const [messages, setMessages] = useState<PiIssueChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [starting, setStarting] = useState(true)
  const [modelLabel, setModelLabel] = useState<string | null>(null)
  const [models, setModels] = useState<PiModelOption[]>([])
  const [sessions, setSessions] = useState<PiSessionInfo[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const sendInFlight = useRef(false)
  const issueContextRef = useRef(issueContext)
  issueContextRef.current = issueContext

  const applySnapshot = useCallback((session: PiIssueChatSessionSnapshot) => {
    setMessages(session.messages)
    setStatus(session.status)
    setError(session.error ?? null)
    if (session.provider && session.modelId) {
      setModelLabel(`${session.provider}/${session.modelId}`)
    }
  }, [])

  const refreshSessions = useCallback(async () => {
    const piApi = window.api.piIssueChat
    if (!piApi) {
      return
    }
    try {
      setSessions(await piApi.listSessions({ sessionId, cwd }))
    } catch {
      /* ignore */
    }
  }, [sessionId, cwd])

  useEffect(() => {
    const piApi = window.api.piIssueChat
    if (!piApi) {
      return
    }
    piApi
      .listModels()
      .then(setModels)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!pickerOpen) {
      return
    }
    const h = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [pickerOpen])

  useEffect(() => {
    if (!historyOpen) {
      return
    }
    const h = (e: MouseEvent) => {
      if (!historyRef.current?.contains(e.target as Node)) {
        setHistoryOpen(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [historyOpen])

  // Start session
  useEffect(() => {
    let cancelled = false
    const piApi = window.api.piIssueChat
    if (!piApi) {
      setStarting(false)
      setStatus('error')
      setError('Pi chat unavailable. Restart Orca dev.')
      return
    }

    const unsub = piApi.onEvent((event: PiIssueChatEvent) => {
      if (event.type === 'snapshot') {
        if (event.session.sessionId !== sessionId) {
          return
        }
        applySnapshot(event.session)
        return
      }
      if (!('sessionId' in event) || event.sessionId !== sessionId) {
        return
      }
      if (event.type === 'message') {
        setMessages((c) => upsertMessage(c, event.message))
        return
      }
      if (event.type === 'assistantDelta') {
        setMessages((c) =>
          c.map((m) => (m.id === event.messageId ? { ...m, content: m.content + event.delta } : m))
        )
        return
      }
      if (event.type === 'reasoningDelta') {
        setMessages((c) =>
          c.map((m) => (m.id === event.messageId ? { ...m, content: m.content + event.delta } : m))
        )
        return
      }
      if (event.type === 'status') {
        setStatus(event.status)
        setError(event.error ?? null)
      }
    })

    void (async () => {
      setStarting(true)
      setMessages([])
      setError(null)
      try {
        const settings = useAppStore.getState().settings
        const modelRef = settings?.agentDefaultEnv?.['strands']?.['ORCA_STRANDS_MODEL'] ?? undefined
        const session = await piApi.start({
          sessionId,
          cwd,
          issueContext: issueContextRef.current,
          modelRef
        })
        if (!cancelled) {
          applySnapshot(session)
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) {
          setStarting(false)
          void refreshSessions()
        }
      }
    })()

    return () => {
      cancelled = true
      unsub()
      void piApi.detach(sessionId)
    }
  }, [applySnapshot, cwd, sessionId, refreshSessions])

  useEffect(() => {
    const el = listRef.current
    if (!el) {
      return
    }
    el.scrollTop = el.scrollHeight
  }, [messages, status])

  const handleModelSelect = async (ref: string): Promise<void> => {
    setPickerOpen(false)
    const piApi = window.api.piIssueChat
    if (!piApi) {
      return
    }
    setSwitching(true)
    try {
      setModelLabel(await piApi.setModel({ sessionId, modelRef: ref }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSwitching(false)
    }
  }

  const handleNewSession = async (): Promise<void> => {
    setHistoryOpen(false)
    const piApi = window.api.piIssueChat
    if (!piApi) {
      return
    }
    setStarting(true)
    setMessages([])
    try {
      const session = await piApi.newSession({
        sessionId,
        cwd,
        issueContext: issueContextRef.current
      })
      applySnapshot(session)
      void refreshSessions()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  const handleSwitchSession = async (path: string): Promise<void> => {
    setHistoryOpen(false)
    const piApi = window.api.piIssueChat
    if (!piApi) {
      return
    }
    setStarting(true)
    setMessages([])
    try {
      const session = await piApi.switchSession({
        sessionId,
        cwd,
        issueContext: issueContextRef.current,
        sessionPath: path
      })
      applySnapshot(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  const handleDeleteSession = async (e: React.MouseEvent, path: string): Promise<void> => {
    e.stopPropagation()
    const piApi = window.api.piIssueChat
    if (!piApi) {
      return
    }
    await piApi.deleteSession({ sessionId, sessionPath: path })
    void refreshSessions()
  }

  const canSend = useMemo(
    () => draft.trim().length > 0 && status !== 'running' && !starting && !sendInFlight.current,
    [draft, starting, status]
  )
  const renderItems = useMemo(() => groupMessagesForRender(messages), [messages])
  // Why: the live thinking-aside is the LAST reasoning message (it sits above
  // its assistant reply, so "last item" is wrong). Auto-expand only that one
  // while the agent runs; earlier turns' reasoning stays collapsed.
  const lastReasoningId = useMemo(() => {
    for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
      if (messages[idx]?.role === 'reasoning') {
        return messages[idx]!.id
      }
    }
    return null
  }, [messages])
  const handleSend = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || sendInFlight.current || status === 'running') {
      return
    }
    sendInFlight.current = true
    setDraft('')
    try {
      const piApi = window.api.piIssueChat
      if (!piApi) {
        throw new Error('Pi chat unavailable.')
      }
      await piApi.send({ sessionId, text })
      void refreshSessions()
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      sendInFlight.current = false
    }
  }

  // Why: force-stop aborts the in-flight turn but keeps the session warm, so
  // the user can immediately continue. Mirrors the composer's send guard.
  const handleStop = (): void => {
    const piApi = window.api.piIssueChat
    if (!piApi) {
      return
    }
    void piApi.stop(sessionId)
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/50 bg-card/40',
        className
      )}
    >
      <IssueStrandsChatHeader
        starting={starting}
        switching={switching}
        status={status}
        modelLabel={modelLabel}
        models={models}
        sessions={sessions}
        pickerOpen={pickerOpen}
        historyOpen={historyOpen}
        pickerRef={pickerRef}
        historyRef={historyRef}
        onTogglePicker={() => setPickerOpen((v) => !v)}
        onToggleHistory={() => {
          setHistoryOpen((v) => !v)
          if (!historyOpen) {
            void refreshSessions()
          }
        }}
        onSelectModel={(ref) => void handleModelSelect(ref)}
        onNewSession={() => void handleNewSession()}
        onSwitchSession={(path) => void handleSwitchSession(path)}
        onDeleteSession={(e, path) => void handleDeleteSession(e, path)}
      />

      <IssueStrandsChatMessages
        messages={messages}
        renderItems={renderItems}
        status={status}
        starting={starting}
        lastReasoningId={lastReasoningId}
        listRef={listRef}
      />

      {/* Composer */}
      <div className="shrink-0 border-t border-border/50 p-2">
        {error && status === 'error' && (
          <p className="mb-1.5 px-1 text-[10px] text-destructive">{error}</p>
        )}
        <div className="flex gap-1.5">
          <textarea
            className="min-h-[36px] flex-1 resize-none rounded-md border border-border/50 bg-background px-2.5 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            placeholder="Ask pi about this issue…"
            rows={1}
            value={draft}
            disabled={starting || status === 'running'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
          />
          {status === 'running' ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-9 shrink-0"
              onClick={handleStop}
              title="Stop"
            >
              <Square className="size-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="size-9 shrink-0"
              disabled={!canSend}
              onClick={() => void handleSend()}
            >
              <Send className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
