/**
 * Collapsible thinking-aside (spoiler) for the issue pi chat. Auto-expands
 * while the agent streams reasoning so the user watches it live; collapses to
 * a one-line preview once the turn finishes. Click toggles.
 */
import { useEffect, useState } from 'react'
import { Brain, ChevronDown } from 'lucide-react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import type { PiIssueChatMessage } from '../../../../shared/pi-issue-chat-types'

export function ReasoningBubble({
  message,
  streaming
}: {
  message: PiIssueChatMessage
  streaming: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(streaming)
  useEffect(() => {
    if (streaming) {
      setOpen(true)
    }
  }, [streaming])
  const preview =
    message.content.length > 120 ? `${message.content.slice(0, 120).trimEnd()}…` : message.content
  return (
    <div className="flex gap-2">
      <Brain className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-1.5 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn('size-3 shrink-0 transition-transform', open ? '' : '-rotate-90')}
          />
          <span>{streaming ? 'Thinking…' : 'Thinking'}</span>
          {!open && (
            <span className="truncate font-mono text-[10px] text-muted-foreground/70">
              {preview}
            </span>
          )}
        </button>
        {open && (
          <div className="mt-1 rounded-md border-l-2 border-border/60 bg-muted/30 px-2.5 py-1.5 text-[12px] italic text-muted-foreground">
            <CommentMarkdown content={message.content} />
          </div>
        )}
      </div>
    </div>
  )
}
