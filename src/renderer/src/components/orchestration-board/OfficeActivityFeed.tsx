import React, { useCallback, useEffect, useRef, useState } from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { OrchestrationBoardComment } from './orchestration-board-model'

const LOCAL = { kind: 'local' as const }
const POLL_MS = 5_000
const MAX_EVENTS = 60

type ActivityEvent = {
  id: string
  author: string
  body: string
  kind: string
  created_at: string
  taskTitle?: string
  taskId?: string
}

function eventIcon(kind: string): string {
  switch (kind) {
    case 'dispatch':
      return '⚡'
    case 'result':
      return '✅'
    case 'system':
      return '🔧'
    default:
      return '💬'
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) {
    return `${s}s ago`
  }
  const m = Math.floor(s / 60)
  if (m < 60) {
    return `${m}m ago`
  }
  return `${Math.floor(m / 60)}h ago`
}

export function OfficeActivityFeed({ taskIds }: { taskIds: string[] }): React.JSX.Element {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const seenRef = useRef(new Set<string>())
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchComments = useCallback(async () => {
    if (taskIds.length === 0) {
      return
    }
    // Fetch comments for up to 20 most-recent task ids to stay within budget
    const sample = taskIds.slice(0, 20)
    const results = await Promise.allSettled(
      sample.map((id) =>
        callRuntimeRpc<{ comments: OrchestrationBoardComment[]; taskTitle?: string }>(
          LOCAL,
          'orchestration.taskThread',
          { task: id },
          { timeoutMs: 8_000, skipCompatibilityCheck: true }
        ).then((r) => ({ id, comments: r.comments ?? [], taskTitle: r.taskTitle }))
      )
    )
    const fresh: ActivityEvent[] = []
    for (const res of results) {
      if (res.status !== 'fulfilled') {
        continue
      }
      const { id, comments, taskTitle } = res.value
      for (const c of comments) {
        if (seenRef.current.has(c.id)) {
          continue
        }
        seenRef.current.add(c.id)
        fresh.push({
          id: c.id,
          author: c.author,
          body: c.body.slice(0, 120),
          kind: c.kind,
          created_at: c.created_at,
          taskTitle: taskTitle ?? undefined,
          taskId: id
        })
      }
    }
    if (fresh.length > 0) {
      setEvents((prev) =>
        [...fresh, ...prev]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, MAX_EVENTS)
      )
    }
  }, [taskIds])

  useEffect(() => {
    void fetchComments()
    const id = setInterval(() => {
      void fetchComments()
    }, POLL_MS)
    return () => {
      clearInterval(id)
    }
  }, [fetchComments])

  return (
    <div className="flex min-h-0 w-56 shrink-0 flex-col border-l border-border/40">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/40 px-3 py-2">
        <span className="text-[11px] font-semibold text-foreground">Activity</span>
        {events.length > 0 && (
          <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {events.length}
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-y-auto p-2"
        style={{ scrollbarWidth: 'thin' }}
      >
        {events.length === 0 ? (
          <p className="mt-4 text-center text-[11px] text-muted-foreground/50">No activity yet</p>
        ) : (
          <div className="flex flex-col gap-2">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="rounded-lg border border-border/40 bg-card/60 px-2 py-1.5"
              >
                <div className="mb-0.5 flex items-center gap-1">
                  <span className="text-[11px]">{eventIcon(ev.kind)}</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-foreground">
                    {ev.author}
                  </span>
                  <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                    {relativeTime(ev.created_at)}
                  </span>
                </div>
                {ev.taskTitle && (
                  <p className="mb-0.5 truncate text-[9px] text-muted-foreground/70">
                    {ev.taskTitle}
                  </p>
                )}
                <p className="line-clamp-2 text-[10px] text-muted-foreground">{ev.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
