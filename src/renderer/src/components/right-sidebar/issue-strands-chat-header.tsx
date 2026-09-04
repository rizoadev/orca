/**
 * Header for the issue pi chat: model picker (grouped by provider) and the
 * session-history dropdown (resume / new / delete). Extracted from
 * issue-strands-chat-panel to keep that module within the max-lines budget.
 */
import { ChevronDown, Clock, LoaderCircle, Plus, Sparkles, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  PiIssueChatStatus,
  PiModelOption,
  PiSessionInfo
} from '../../../../shared/pi-issue-chat-types'

function formatRelativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs
  if (diff < 60000) {
    return 'just now'
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}m ago`
  }
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}h ago`
  }
  return `${Math.floor(diff / 86400000)}d ago`
}

function groupByProvider(models: PiModelOption[]): Record<string, PiModelOption[]> {
  const out: Record<string, PiModelOption[]> = {}
  for (const m of models) {
    ;(out[m.provider] ??= []).push(m)
  }
  return out
}

export function IssueStrandsChatHeader({
  starting,
  switching,
  status,
  modelLabel,
  models,
  sessions,
  pickerOpen,
  historyOpen,
  pickerRef,
  historyRef,
  onTogglePicker,
  onToggleHistory,
  onSelectModel,
  onNewSession,
  onSwitchSession,
  onDeleteSession
}: {
  starting: boolean
  switching: boolean
  status: PiIssueChatStatus
  modelLabel: string | null
  models: PiModelOption[]
  sessions: PiSessionInfo[]
  pickerOpen: boolean
  historyOpen: boolean
  pickerRef: React.RefObject<HTMLDivElement | null>
  historyRef: React.RefObject<HTMLDivElement | null>
  onTogglePicker: () => void
  onToggleHistory: () => void
  onSelectModel: (ref: string) => void
  onNewSession: () => void
  onSwitchSession: (path: string) => void
  onDeleteSession: (e: React.MouseEvent, path: string) => void
}): React.JSX.Element {
  const groupedModels = groupByProvider(models)
  return (
    <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-3 py-2">
      <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />

      {/* Model picker */}
      <div ref={pickerRef} className="relative min-w-0 flex-1">
        <button
          className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          disabled={starting || switching}
          onClick={onTogglePicker}
          title="Switch model"
        >
          <span className="truncate">
            {switching ? 'Switching…' : (modelLabel ?? 'Issue chat · pi')}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </button>
        {pickerOpen && models.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
            {Object.entries(groupedModels).map(([provider, pModels]) => (
              <div key={provider}>
                <div className="sticky top-0 bg-popover px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {provider}
                </div>
                {pModels.map((m) => (
                  <button
                    key={m.ref}
                    className={cn(
                      'w-full px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground',
                      modelLabel === `${m.provider}/${m.modelId}` && 'bg-accent/40 font-medium'
                    )}
                    onClick={() => onSelectModel(m.ref)}
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

      {/* Session history */}
      <div ref={historyRef} className="relative shrink-0">
        <button
          className="flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Session history"
          onClick={onToggleHistory}
        >
          <Clock className="size-3.5" />
        </button>
        {historyOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
              <span className="text-xs font-medium">Session history</span>
              <button
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={onNewSession}
              >
                <Plus className="size-3" />
                New chat
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {sessions.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  No saved sessions
                </p>
              )}
              {sessions.map((s) => (
                <button
                  key={s.path}
                  className={cn(
                    'group flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent',
                    s.isActive && 'bg-accent/30'
                  )}
                  onClick={() => onSwitchSession(s.path)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">{s.firstMessage || '(empty session)'}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(s.createdAt)}
                      {s.isActive ? ' · active' : ''}
                    </p>
                  </div>
                  <button
                    className="shrink-0 rounded p-0.5 opacity-0 hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
                    onClick={(e) => onDeleteSession(e, s.path)}
                    title="Delete"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {status === 'running' && (
        <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}
