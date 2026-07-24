/**
 * In-modal pi agent chat for issues: message list + composer + model picker + session management.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { ChevronDown, Clock, LoaderCircle, Plus, Send, Sparkles, Terminal, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
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

type ChatRenderItem =
  | { kind: 'message'; message: PiIssueChatMessage }
  | { kind: 'tools'; tools: PiIssueChatMessage[] }

function upsertMessage(messages: PiIssueChatMessage[], message: PiIssueChatMessage): PiIssueChatMessage[] {
  const idx = messages.findIndex((m) => m.id === message.id)
  if (idx >= 0) { const next = [...messages]; next[idx] = message; return next }
  return [...messages, message]
}

function groupMessagesForRender(messages: PiIssueChatMessage[]): ChatRenderItem[] {
  const items: ChatRenderItem[] = []
  let toolBatch: PiIssueChatMessage[] = []
  for (const message of messages) {
    if (message.role === 'tool') { toolBatch.push(message) } else {
      if (toolBatch.length > 0) { items.push({ kind: 'tools', tools: toolBatch }); toolBatch = [] }
      items.push({ kind: 'message', message })
    }
  }
  if (toolBatch.length > 0) { items.push({ kind: 'tools', tools: toolBatch }) }
  return items
}

function groupByProvider(models: PiModelOption[]): Record<string, PiModelOption[]> {
  const out: Record<string, PiModelOption[]> = {}
  for (const m of models) { (out[m.provider] ??= []).push(m) }
  return out
}

function formatRelativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs
  if (diff < 60000) { return 'just now' }
  if (diff < 3600000) { return `${Math.floor(diff / 60000)}m ago` }
  if (diff < 86400000) { return `${Math.floor(diff / 3600000)}h ago` }
  return `${Math.floor(diff / 86400000)}d ago`
}

export function IssueStrandsChatPanel({
  sessionId, cwd, issueContext, className
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
    if (session.provider && session.modelId) { setModelLabel(`${session.provider}/${session.modelId}`) }
  }, [])

  const refreshSessions = useCallback(async () => {
    const piApi = window.api.piIssueChat
    if (!piApi) { return }
    try { setSessions(await piApi.listSessions({ sessionId, cwd })) } catch { /* ignore */ }
  }, [sessionId, cwd])

  useEffect(() => {
    const piApi = window.api.piIssueChat
    if (!piApi) { return }
    piApi.listModels().then(setModels).catch(() => {})
  }, [])

  useEffect(() => {
    if (!pickerOpen) { return }
    const h = (e: MouseEvent) => { if (!pickerRef.current?.contains(e.target as Node)) { setPickerOpen(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [pickerOpen])

  useEffect(() => {
    if (!historyOpen) { return }
    const h = (e: MouseEvent) => { if (!historyRef.current?.contains(e.target as Node)) { setHistoryOpen(false) } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [historyOpen])

  // Start session
  useEffect(() => {
    let cancelled = false
    const piApi = window.api.piIssueChat
    if (!piApi) { setStarting(false); setStatus('error'); setError('Pi chat unavailable. Restart Orca dev.'); return }

    const unsub = piApi.onEvent((event: PiIssueChatEvent) => {
      if (event.type === 'snapshot') { if (event.session.sessionId !== sessionId) { return }; applySnapshot(event.session); return }
      if (!('sessionId' in event) || event.sessionId !== sessionId) { return }
      if (event.type === 'message') { setMessages((c) => upsertMessage(c, event.message)); return }
      if (event.type === 'assistantDelta') { setMessages((c) => c.map((m) => m.id === event.messageId ? { ...m, content: m.content + event.delta } : m)); return }
      if (event.type === 'status') { setStatus(event.status); setError(event.error ?? null) }
    })

    void (async () => {
      setStarting(true); setMessages([]); setError(null)
      try {
        const settings = useAppStore.getState().settings
        const modelRef = settings?.agentDefaultEnv?.['strands']?.['ORCA_STRANDS_MODEL'] ?? undefined
        const session = await piApi.start({ sessionId, cwd, issueContext: issueContextRef.current, modelRef })
        if (!cancelled) { applySnapshot(session) }
      } catch (err) {
        if (!cancelled) { setStatus('error'); setError(err instanceof Error ? err.message : String(err)) }
      } finally { if (!cancelled) { setStarting(false); void refreshSessions() } }
    })()

    return () => { cancelled = true; unsub(); void piApi.detach(sessionId) }
  }, [applySnapshot, cwd, sessionId, refreshSessions])

  useEffect(() => { const el = listRef.current; if (!el) { return }; el.scrollTop = el.scrollHeight }, [messages, status])

  const handleModelSelect = async (ref: string): Promise<void> => {
    setPickerOpen(false)
    const piApi = window.api.piIssueChat
    if (!piApi) { return }
    setSwitching(true)
    try { setModelLabel(await piApi.setModel({ sessionId, modelRef: ref })) }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setSwitching(false) }
  }

  const handleNewSession = async (): Promise<void> => {
    setHistoryOpen(false)
    const piApi = window.api.piIssueChat
    if (!piApi) { return }
    setStarting(true); setMessages([])
    try {
      const session = await piApi.newSession({ sessionId, cwd, issueContext: issueContextRef.current })
      applySnapshot(session)
      void refreshSessions()
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setStarting(false) }
  }

  const handleSwitchSession = async (path: string): Promise<void> => {
    setHistoryOpen(false)
    const piApi = window.api.piIssueChat
    if (!piApi) { return }
    setStarting(true); setMessages([])
    try {
      const session = await piApi.switchSession({ sessionId, cwd, issueContext: issueContextRef.current, sessionPath: path })
      applySnapshot(session)
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    finally { setStarting(false) }
  }

  const handleDeleteSession = async (e: React.MouseEvent, path: string): Promise<void> => {
    e.stopPropagation()
    const piApi = window.api.piIssueChat
    if (!piApi) { return }
    await piApi.deleteSession({ sessionId, sessionPath: path })
    void refreshSessions()
  }

  const canSend = useMemo(
    () => draft.trim().length > 0 && status !== 'running' && !starting && !sendInFlight.current,
    [draft, starting, status]
  )
  const renderItems = useMemo(() => groupMessagesForRender(messages), [messages])
  const groupedModels = useMemo(() => groupByProvider(models), [models])

  const handleSend = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || sendInFlight.current || status === 'running') { return }
    sendInFlight.current = true; setDraft('')
    try {
      const piApi = window.api.piIssueChat
      if (!piApi) { throw new Error('Pi chat unavailable.') }
      await piApi.send({ sessionId, text })
      void refreshSessions()
    } catch (err) { setStatus('error'); setError(err instanceof Error ? err.message : String(err)) }
    finally { sendInFlight.current = false }
  }

  return (
    <div className={cn('flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/50 bg-card/40', className)}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-3 py-2">
        <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />

        {/* Model picker */}
        <div ref={pickerRef} className="relative min-w-0 flex-1">
          <button
            className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={starting || switching}
            onClick={() => setPickerOpen((v) => !v)}
            title="Switch model"
          >
            <span className="truncate">{switching ? 'Switching…' : (modelLabel ?? 'Issue chat · pi')}</span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </button>
          {pickerOpen && models.length > 0 && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
              {Object.entries(groupedModels).map(([provider, pModels]) => (
                <div key={provider}>
                  <div className="sticky top-0 bg-popover px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{provider}</div>
                  {pModels.map((m) => (
                    <button key={m.ref} className={cn('w-full px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground', modelLabel === `${m.provider}/${m.modelId}` && 'bg-accent/40 font-medium')} onClick={() => void handleModelSelect(m.ref)}>
                      <span className="block truncate">{m.name !== m.modelId ? m.name : m.modelId}</span>
                      <span className="text-[10px] text-muted-foreground">{Math.round(m.contextWindow / 1000)}k ctx</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Session history */}
        <div ref={historyRef} className="relative shrink-0">
          <button
            className="flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Session history"
            onClick={() => { setHistoryOpen((v) => !v); if (!historyOpen) { void refreshSessions() } }}
          >
            <Clock className="size-3.5" />
          </button>
          {historyOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
              <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
                <span className="text-xs font-medium">Session history</span>
                <button className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => void handleNewSession()}>
                  <Plus className="size-3" />New chat
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto">
                {sessions.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted-foreground">No saved sessions</p>}
                {sessions.map((s) => (
                  <button key={s.path} className={cn('group flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent', s.isActive && 'bg-accent/30')} onClick={() => void handleSwitchSession(s.path)}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs">{s.firstMessage || '(empty session)'}</p>
                      <p className="text-[10px] text-muted-foreground">{formatRelativeTime(s.createdAt)}{s.isActive ? ' · active' : ''}</p>
                    </div>
                    <button className="shrink-0 rounded p-0.5 opacity-0 hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100" onClick={(e) => void handleDeleteSession(e, s.path)} title="Delete">
                      <Trash2 className="size-3" />
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {status === 'running' && <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      {/* Messages */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {starting && messages.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" /><span>Starting pi agent…</span>
          </div>
        )}
        {!starting && messages.length === 0 && status !== 'error' && (
          <p className="text-sm text-muted-foreground">Ask pi anything about this issue. It can read files, run commands, and edit code.</p>
        )}
        <div className="flex flex-col gap-3">
          {renderItems.map((item, i) => {
            if (item.kind === 'tools') {
              return (
                <div key={`tools-${i}`} className="flex flex-wrap gap-1">
                  {item.tools.map((t) => (
                    <span key={t.id} className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      <Wrench className="size-2.5" />{t.toolName ?? t.content}
                    </span>
                  ))}
                </div>
              )
            }
            const { message } = item
            if (message.role === 'system') { return <p key={message.id} className="text-xs text-destructive">{message.content}</p> }
            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{message.content}</div>
                </div>
              )
            }
            return (
              <div key={message.id} className="flex gap-2">
                <Terminal className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 text-sm"><CommentMarkdown content={message.content} /></div>
              </div>
            )
          })}
          {status === 'running' && messages.at(-1)?.role !== 'assistant' && (
            <div className="flex gap-2">
              <Terminal className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border/50 p-2">
        {error && status === 'error' && <p className="mb-1.5 px-1 text-[10px] text-destructive">{error}</p>}
        <div className="flex gap-1.5">
          <textarea
            className="min-h-[36px] flex-1 resize-none rounded-md border border-border/50 bg-background px-2.5 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            placeholder="Ask pi about this issue…"
            rows={1}
            value={draft}
            disabled={starting || status === 'running'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() } }}
          />
          <Button size="icon" variant="ghost" className="size-9 shrink-0" disabled={!canSend} onClick={() => void handleSend()}>
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
