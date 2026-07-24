/**
 * In-modal Strands chat for issues: message list + composer, no terminal.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { LoaderCircle, Send, Sparkles, Terminal, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import type {
  StrandsIssueChatEvent,
  StrandsIssueChatMessage,
  StrandsIssueChatSessionSnapshot,
  StrandsIssueChatStatus
} from '../../../../shared/strands-issue-chat-types'

export type IssueStrandsChatPanelProps = {
  sessionId: string
  cwd: string
  issueContext: string
  className?: string
}

type ChatRenderItem =
  | { kind: 'message'; message: StrandsIssueChatMessage }
  | { kind: 'tools'; tools: StrandsIssueChatMessage[] }

function upsertMessage(
  messages: StrandsIssueChatMessage[],
  message: StrandsIssueChatMessage
): StrandsIssueChatMessage[] {
  const idx = messages.findIndex((m) => m.id === message.id)
  if (idx < 0) {
    return [...messages, message]
  }
  const next = messages.slice()
  next[idx] = message
  return next
}

/** Collapse consecutive tool messages into one badge row for scanability. */
function groupMessagesForRender(messages: StrandsIssueChatMessage[]): ChatRenderItem[] {
  const items: ChatRenderItem[] = []
  let toolRun: StrandsIssueChatMessage[] = []
  const flushTools = (): void => {
    if (toolRun.length === 0) {
      return
    }
    items.push({ kind: 'tools', tools: toolRun })
    toolRun = []
  }
  for (const message of messages) {
    if (message.role === 'tool') {
      toolRun.push(message)
      continue
    }
    flushTools()
    items.push({ kind: 'message', message })
  }
  flushTools()
  return items
}

function toolBadgeLabel(message: StrandsIssueChatMessage): string {
  const raw = (message.toolName ?? message.content).trim()
  // Why: older turns stored "Running tool: bash"; badge only needs the tool id.
  return raw.replace(/^running tool:\s*/i, '') || 'tool'
}

/** Merge consecutive identical tools: bash, bash, fileEditor → bash (2), fileEditor. */
function collapseToolCounts(
  tools: StrandsIssueChatMessage[]
): { name: string; count: number; id: string }[] {
  const groups: { name: string; count: number; id: string }[] = []
  for (const tool of tools) {
    const name = toolBadgeLabel(tool)
    const last = groups.at(-1)
    if (last && last.name.toLowerCase() === name.toLowerCase()) {
      last.count += 1
      continue
    }
    groups.push({ name, count: 1, id: tool.id })
  }
  return groups
}

function ToolBadge({ name, count }: { name: string; count: number }): React.JSX.Element {
  const lower = name.toLowerCase()
  const Icon = lower.includes('bash') || lower.includes('shell') ? Terminal : Wrench
  const label = count > 1 ? `${name} (${count})` : name
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-300"
      title={count > 1 ? `${name} × ${count}` : name}
    >
      <Icon className="size-2.5 shrink-0 opacity-80" />
      <span className="truncate">{label}</span>
    </span>
  )
}

export function IssueStrandsChatPanel({
  sessionId,
  cwd,
  issueContext,
  className
}: IssueStrandsChatPanelProps): React.JSX.Element {
  const [status, setStatus] = useState<StrandsIssueChatStatus>('idle')
  const [messages, setMessages] = useState<StrandsIssueChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [starting, setStarting] = useState(true)
  const [providerLabel, setProviderLabel] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const sendInFlight = useRef(false)

  const applySnapshot = useCallback((session: StrandsIssueChatSessionSnapshot) => {
    setMessages(session.messages)
    setStatus(session.status)
    setError(session.error ?? null)
    if (session.provider && session.modelId) {
      setProviderLabel(`${session.provider}/${session.modelId}`)
    }
  }, [])

  // Why: details body arrives after open; do not restart the agent on every hydration tick.
  const issueContextRef = useRef(issueContext)
  issueContextRef.current = issueContext

  useEffect(() => {
    let cancelled = false
    const strandsApi = window.api.strandsIssueChat
    if (!strandsApi) {
      setStarting(false)
      setStatus('error')
      setError('Strands chat is unavailable in this build. Restart Orca dev.')
      return
    }
    const unsub = strandsApi.onEvent((event: StrandsIssueChatEvent) => {
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
        // Why: forward agentDefaultEnv.strands so the in-process session uses
        // the same model the user configured for terminal `orca strands` launches.
        const strandsEnv =
          useAppStore.getState().settings?.agentDefaultEnv?.['strands'] ?? undefined
        const session = await strandsApi.start({
          sessionId,
          cwd,
          issueContext: issueContextRef.current,
          strandsEnv
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
      void strandsApi.stop(sessionId)
    }
  }, [applySnapshot, cwd, sessionId])

  useEffect(() => {
    const el = listRef.current
    if (!el) {
      return
    }
    el.scrollTop = el.scrollHeight
  }, [messages, status])

  const canSend = useMemo(() => {
    return draft.trim().length > 0 && status !== 'running' && !starting && !sendInFlight.current
  }, [draft, starting, status])

  const renderItems = useMemo(() => groupMessagesForRender(messages), [messages])

  const handleSend = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || sendInFlight.current || status === 'running') {
      return
    }
    sendInFlight.current = true
    setDraft('')
    try {
      const strandsApi = window.api.strandsIssueChat
      if (!strandsApi) {
        throw new Error('Strands chat is unavailable. Restart Orca dev.')
      }
      await strandsApi.send({ sessionId, text })
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      sendInFlight.current = false
    }
  }

  return (
    // Why: overflow-hidden + min-h-0 keep the transcript scrolled inside the pane instead of growing the modal.
    <div
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/50 bg-card/40',
        className
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2.5">
        <Sparkles className="size-3.5 text-violet-500" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-foreground">Strands</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {providerLabel ?? 'Issue sidebar · deepseek-v4-flash'}
          </div>
        </div>
        {status === 'running' || starting ? (
          <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div
        ref={listRef}
        className="min-h-0 min-w-0 flex-1 space-y-2.5 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 scrollbar-sleek"
      >
        {starting && messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">Starting Strands…</p>
        ) : null}
        {!starting && messages.length === 0 ? (
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>Chat about this issue. Strands can read/edit the worktree and run shell commands.</p>
            <p>
              Default: llmproxy ·{' '}
              <code className="text-[10px]">cline2/deepseek/deepseek-v4-flash</code>
            </p>
          </div>
        ) : null}
        {renderItems.map((item) => {
          if (item.kind === 'tools') {
            const grouped = collapseToolCounts(item.tools)
            return (
              <div
                key={`tools-${item.tools[0]?.id ?? 'x'}`}
                className="flex flex-wrap items-center gap-1.5"
              >
                {grouped.map((tool) => (
                  <ToolBadge key={tool.id} name={tool.name} count={tool.count} />
                ))}
              </div>
            )
          }
          const message = item.message
          return (
            <div
              key={message.id}
              className={cn(
                'min-w-0 max-w-full overflow-hidden rounded-md px-2.5 py-2 text-xs leading-relaxed',
                message.role === 'user' && 'ml-6 bg-primary/10 text-foreground',
                message.role === 'assistant' &&
                  'mr-0 border border-border/40 bg-muted/40 text-foreground',
                message.role === 'system' && 'bg-destructive/10 text-destructive'
              )}
            >
              {message.role === 'assistant' ? (
                <CommentMarkdown
                  content={message.content}
                  className="comment-markdown max-w-full overflow-hidden text-xs leading-relaxed break-words [&_code]:break-all [&_code]:text-[11px] [&_li]:my-0.5 [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:text-[11px]"
                />
              ) : (
                <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {message.content}
                </div>
              )}
            </div>
          )
        })}
        {error ? (
          <div className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-border/40 p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Ask Strands about this issue…"
          disabled={starting || status === 'running'}
          className="min-h-9 w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs shadow-xs focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/50 disabled:opacity-60"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && canSend) {
              e.preventDefault()
              void handleSend()
            }
          }}
        />
        <Button
          size="sm"
          disabled={!canSend}
          onClick={() => void handleSend()}
          className="shrink-0 gap-1"
        >
          {status === 'running' ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
          Send
        </Button>
      </div>
    </div>
  )
}
