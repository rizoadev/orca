/**
 * Message list for the issue pi chat: renders grouped tool runs, the live
 * reasoning-aside (spoiler), user/assistant/system turns, and the running
 * spinner. Extracted from issue-strands-chat-panel to keep that module within
 * the max-lines budget and to isolate the per-role rendering rules.
 */
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { LoaderCircle, Terminal, Wrench } from 'lucide-react'
import type { PiIssueChatMessage, PiIssueChatStatus } from '../../../../shared/pi-issue-chat-types'
import { ReasoningBubble } from './issue-strands-reasoning-bubble'

export type ChatRenderItem =
  | { kind: 'message'; message: PiIssueChatMessage }
  | { kind: 'tools'; tools: PiIssueChatMessage[] }

/** Collapse consecutive tool rows into one batch so the transcript reads as
 *  grouped activity chips rather than a wall of single lines. */
export function groupMessagesForRender(messages: PiIssueChatMessage[]): ChatRenderItem[] {
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

export function ChatMessageItem({
  item,
  status,
  lastReasoningId
}: {
  item: ChatRenderItem
  status: PiIssueChatStatus
  lastReasoningId: string | null
}): React.JSX.Element {
  if (item.kind === 'tools') {
    return (
      <div className="flex flex-wrap gap-1">
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
  if (message.role === 'reasoning') {
    return (
      <ReasoningBubble
        message={message}
        streaming={status === 'running' && message.id === lastReasoningId}
      />
    )
  }
  if (message.role === 'system') {
    return <p className="text-xs text-destructive">{message.content}</p>
  }
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-2">
      <Terminal className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 text-sm">
        <CommentMarkdown content={message.content} />
      </div>
    </div>
  )
}

export function IssueStrandsChatMessages({
  messages,
  renderItems,
  status,
  starting,
  lastReasoningId,
  listRef
}: {
  messages: PiIssueChatMessage[]
  renderItems: ChatRenderItem[]
  status: PiIssueChatStatus
  starting: boolean
  lastReasoningId: string | null
  listRef: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element {
  return (
    <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      {starting && messages.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          <span>Starting pi agent…</span>
        </div>
      )}
      {!starting && messages.length === 0 && status !== 'error' && (
        <p className="text-sm text-muted-foreground">
          Ask pi anything about this issue. It can read files, run commands, and edit code.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {renderItems.map((item, i) => (
          <ChatMessageItem
            key={item.kind === 'message' ? item.message.id : `tools-${i}`}
            item={item}
            status={status}
            lastReasoningId={lastReasoningId}
          />
        ))}
        {status === 'running' &&
          messages.at(-1)?.role !== 'assistant' &&
          messages.at(-1)?.role !== 'reasoning' && (
            <div className="flex gap-2">
              <Terminal className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
            </div>
          )}
      </div>
    </div>
  )
}
