import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Link2, LoaderCircle, MessageCircle, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type {
  TelegramBridgeEvent,
  TelegramBridgeStatus
} from '../../../../shared/telegram-bridge-types'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree-id'

function formatTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function TelegramBridgePanel({
  isVisible
}: {
  isVisible: boolean
}): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)

  const repoId = activeWorktree?.repoId ?? null
  const [status, setStatus] = useState<TelegramBridgeStatus | null>(null)
  const [events, setEvents] = useState<TelegramBridgeEvent[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    const [nextStatus, nextEvents] = await Promise.all([
      window.api.telegramBridge.getStatus(),
      window.api.telegramBridge.getEvents({ limit: 80 })
    ])
    setStatus(nextStatus)
    setEvents(nextEvents)
  }, [])

  useEffect(() => {
    if (!isVisible) {
      return
    }
    void refresh().catch(() => {})
    const offStatus = window.api.telegramBridge.onStatus(setStatus)
    const offEvent = window.api.telegramBridge.onEvent((event) => {
      setEvents((prev) => {
        if (prev.some((row) => row.id === event.id)) {
          return prev
        }
        return [...prev.slice(-79), event]
      })
    })
    return () => {
      offStatus()
      offEvent()
    }
  }, [isVisible, refresh])

  // Why: every repo gets a topic automatically once global group/token are set.
  useEffect(() => {
    if (!isVisible || !repoId || !status?.config.enabled) {
      return
    }
    if (status.config.telegramGroupId === null || !status.config.botTokenConfigured) {
      return
    }
    if (status.config.mappings.some((row) => row.repoId === repoId)) {
      return
    }
    let cancelled = false
    void window.api.telegramBridge
      .ensureTopicForRepo({
        repoId,
        topicName: activeRepo?.displayName || repoId,
        label: activeRepo?.displayName || repoId
      })
      .then(() => {
        if (!cancelled) {
          return refresh()
        }
        return undefined
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [
    activeRepo?.displayName,
    isVisible,
    refresh,
    repoId,
    status?.config.botTokenConfigured,
    status?.config.enabled,
    status?.config.mappings,
    status?.config.telegramGroupId
  ])

  useEffect(() => {
    const node = listRef.current
    if (!node) {
      return
    }
    node.scrollTop = node.scrollHeight
  }, [events, repoId])

  const mapping = useMemo(
    () => (repoId ? (status?.config.mappings.find((row) => row.repoId === repoId) ?? null) : null),
    [repoId, status?.config.mappings]
  )

  const liveSession = useMemo(() => {
    if (!repoId) {
      return null
    }
    let best: { paneKey: string; state: string; updatedAt: number } | null = null
    for (const [paneKey, entry] of Object.entries(agentStatusByPaneKey)) {
      if (!entry?.worktreeId) {
        continue
      }
      if (getRepoIdFromWorktreeId(entry.worktreeId) !== repoId) {
        continue
      }
      const updatedAt = entry.updatedAt ?? 0
      if (!best || updatedAt >= best.updatedAt) {
        best = { paneKey, state: entry.state, updatedAt }
      }
    }
    return best
  }, [agentStatusByPaneKey, repoId])

  const scopedEvents = useMemo(() => {
    if (!repoId) {
      return events.filter((event) => event.direction === 'system').slice(-40)
    }
    return events.filter((event) => !event.repoId || event.repoId === repoId).slice(-60)
  }, [events, repoId])

  const send = async (): Promise<void> => {
    if (!repoId || !draft.trim() || sending) {
      return
    }
    setSending(true)
    try {
      const result = await window.api.telegramBridge.sendFromOrca({
        repoId,
        text: draft.trim(),
        mirrorToTelegram: true
      })
      if (!result.ok) {
        toast.error(
          result.reason === 'no_live_session'
            ? translate(
                'rightSidebar.telegram.noLiveSession',
                'No live Orca terminal for this repo. Open/start an agent tab first.'
              )
            : result.reason
        )
        return
      }
      setDraft('')
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <MessageCircle size={14} className="text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">
            {translate('rightSidebar.telegram.title', 'Remote chat')}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {activeRepo?.displayName || repoId || '—'}
            {mapping
              ? ` · topic ${mapping.messageThreadId}`
              : ` · ${translate('rightSidebar.telegram.unlinked', 'not linked')}`}
          </p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => {
            openSettingsTarget({ pane: 'integrations', repoId: null })
            openSettingsPage()
          }}
          aria-label={translate('rightSidebar.telegram.openSettings', 'Open Telegram settings')}
        >
          <Settings2 size={14} />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span
          className={cn(
            'rounded-full border px-2 py-0.5',
            status?.running
              ? 'border-status-success-border bg-status-success-background text-status-success'
              : 'border-border'
          )}
        >
          {status?.running
            ? translate('rightSidebar.telegram.running', 'Bridge on')
            : translate('rightSidebar.telegram.stopped', 'Bridge off')}
        </span>
        {liveSession ? (
          <span className="truncate">
            {translate('rightSidebar.telegram.session', 'Session')}: {liveSession.state}
          </span>
        ) : (
          <span>{translate('rightSidebar.telegram.noSession', 'No live session')}</span>
        )}
        {!mapping ? (
          <span className="inline-flex items-center gap-1">
            <Link2 size={11} />
            {translate('rightSidebar.telegram.linkHint', 'Link a topic in Settings')}
          </span>
        ) : null}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {scopedEvents.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
            {translate(
              'rightSidebar.telegram.empty',
              'Messages from Telegram and Orca for this repo will appear here.'
            )}
          </div>
        ) : (
          scopedEvents.map((event) => (
            <div
              key={event.id}
              className={cn(
                'rounded-md border px-2.5 py-2 text-xs',
                event.direction === 'inbound'
                  ? 'border-border bg-muted/40'
                  : event.direction === 'outbound'
                    ? 'border-border/70 bg-background'
                    : 'border-dashed border-border/60 text-muted-foreground'
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                <span>{event.direction}</span>
                <span>{formatTime(event.at)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-foreground">{event.text}</p>
              {event.detail ? (
                <p className="mt-1 text-[10px] text-muted-foreground">{event.detail}</p>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border/60 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            disabled={!repoId || sending}
            placeholder={translate(
              'rightSidebar.telegram.placeholder',
              'Message the live agent… also mirrors to Telegram when linked'
            )}
            className="min-h-[56px] flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
          />
          <Button
            size="icon-sm"
            disabled={!repoId || !draft.trim() || sending}
            onClick={() => void send()}
            aria-label={translate('rightSidebar.telegram.send', 'Send')}
          >
            {sending ? <LoaderCircle size={14} className="animate-spin" /> : <ArrowUp size={14} />}
          </Button>
        </div>
      </div>
    </div>
  )
}
