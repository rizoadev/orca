/**
 * In-modal pi agent chat for issues: message list + composer + model picker.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { ChevronDown, LoaderCircle, Send, Sparkles, Terminal, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import type {
  PiIssueChatEvent,
  PiIssueChatMessage,
  PiIssueChatSessionSnapshot,
  PiIssueChatStatus,
  PiModelOption
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

function groupMessagesForRender(messages: PiIssueChatMessage[]): ChatRenderItem[] {
  const items: ChatRenderItem[] = []
  let toolBatch: PiIssueChatMessage[] = []
  for (const message of messages) {
    if (message.role === 'tool') {
      toolBatch.push(message)
    } else {
      if (toolBatch.length > 0) {
        items.push({ kind: 'tools', tools: toolBatch })
        toolBatch = []
      }
      items.push({ kind: 'message', message })
    }
  }
  if (toolBatch.length > 0) {
    items.push({ kind: 'tools', tools: toolBatch })
  }
  return items
}

/** Group models by provider for the picker dropdown. */
function groupByProvider(models: PiModelOption[]): Record<string, PiModelOption[]> {
  const out: Record<string, PiModelOption[]> = {}
  for (const m of models) {
    ;(out[m.provider] ??= []).push(m)
  }
  return out
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

  // model picker state
  const [models, setModels] = useState<PiModelOption[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const listRef = useRef<HTMLDivElement | null>(null)
  const sendInFlight = useRef(false)

  const applySnapshot = useCallback((session: PiIssueChatSessionSnapshot) => {
    setMessages(session.messages)
    setStatus(session.status)
    setError(session.error ?? null)
    if (session.provider && session.modelId) {
      setModelLabel(`${session.provider}/${session.modelId}`)
    }
  }, [])

  const issueContextRef = useRef(issueContext)
  issueContextRef.current = issueContext

  // Load model list once
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

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) {
      return
    }
    const handler = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  // Start session
  useEffect(() => {
    let cancelled = false
    const piApi = window.api.piIssueChat
    if (!piApi) {
      setStarting(false)
      setStatus('error')
      setError('Pi chat is unavailable in this build. Restart Orca dev.')
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
        setMessages((current) => upsertMessage(current, event.message))
        return
      }
      if (event.type === 'assistantDelta') {
        setMessages((current) =>
          current.map((m) =>
            m.id === event.messageId ? { ...m, content: m.content + event.delta } : m
          )
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
        }
      }
    })()

    return () => {
      cancelled = true
      unsub()
      void piApi.stop(sessionId)
    }
  }, [applySnapshot, cwd, sessionId])

  useEffect(() => {
    const el = listRef.current
    if (!el) {
      return
    }
    el.scrollTop = el.scrollHeight
  }, [messages, status])

  // Switch model
  const handleModelSelect = async (ref: string): Promise<void> => {
    setPickerOpen(false)
    const piApi = window.api.piIssueChat
    if (!piApi) {
      return
    }
    setSwitching(true)
    try {
      const newLabel = await piApi.setModel({ sessionId, modelRef: ref })
      setModelLabel(newLabel)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSwitching(false)
    }
  }

  const canSend = useMemo(
    () => draft.trim().length > 0 && status !== 'running' && !starting && !sendInFlight.current,
    [draft, starting, status]
  )

  const renderItems = useMemo(() => groupMessagesForRender(messages), [messages])
  const groupedModels = useMemo(() => groupByProvider(models), [models])

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
        throw new Error('Pi chat is unavailable. Restart Orca dev.')
      }
      await piApi.send({ sessionId, text })
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      sendInFlight.current = false
    }
  }

  return (
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/50 bg-card/40',
        className
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />

        {/* Model picker */}
        <div ref={pickerRef} className="relative min-w-0 flex-1">
          <button
            className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={starting || switching}
            onClick={() => setPickerOpen((v) => !v)}
            title="Switch model"
          >
            <span className="truncate">
              {switching ? 'Switching…' : (modelLabel ?? 'Issue chat · pi')}
            </span>
            <ChevronDown className="size-3 shrink-0 opacity-60" />
          </button>

          {/* Dropdown */}
          {pickerOpen && models.length > 0 && (
            <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
              {Object.entries(groupedModels).map(([provider, providerModels]) => (
                <div key={provider}>
                  <div className="sticky top-0 bg-popover px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {provider}
                  </div>
                  {providerModels.map((m) => (
                    <button
                      key={m.ref}
                      className={cn(
                        'w-full px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground',
                        modelLabel === `${m.provider}/${m.modelId}` &&
                          'bg-accent/40 font-medium text-accent-foreground'
                      )}
                      onClick={() => void handleModelSelect(m.ref)}
                    >
                      <span className="block truncate">
                        {m.name !== m.modelId ? m.name : m.modelId}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {Math.round(m.contextWindow / 1000)}k ctx
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {status === 'running' && (
          <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Message list */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {starting && messages.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            <span>Starting pi agent…</span>
          </div>
        )}
        {!starting && messages.length === 0 && status !== 'error' && (
          <p className="text-xs text-muted-foreground">
            Ask pi anything about this issue. It can read files, run commands, and edit code.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {renderItems.map((item, i) => {
            if (item.kind === 'tools') {
              return (
                <div key={`tools-${i}`} className="flex flex-wrap gap-1">
                  {item.tools.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      <Wrench className="size-2.5" />
                      {t.toolName ?? t.content}
                    </span>
                  ))}
                </div>
              )
            }
            const { message } = item
            if (message.role === 'system') {
              return (
                <p key={message.id} className="text-xs text-destructive">
                  {message.content}
                </p>
              )
            }
            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground">
                    {message.content}
                  </div>
                </div>
              )
            }
            return (
              <div key={message.id} className="flex gap-2">
                <Terminal className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 text-xs">
                  <CommentMarkdown content={message.content} />
                </div>
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
        {error && status === 'error' && (
          <p className="mb-1.5 px-1 text-[10px] text-destructive">{error}</p>
        )}
        <div className="flex gap-1.5">
          <textarea
            className="min-h-[36px] flex-1 resize-none rounded-md border border-border/50 bg-background px-2.5 py-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
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
          <Button
            size="icon"
            variant="ghost"
            className="size-9 shrink-0"
            disabled={!canSend}
            onClick={() => void handleSend()}
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
