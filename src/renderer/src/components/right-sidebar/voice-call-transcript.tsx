import type React from 'react'
import { Square } from 'lucide-react'
import { ReasoningBubble } from './issue-strands-reasoning-bubble'
import { ChatMessageItem, groupMessagesForRender } from './issue-strands-chat-messages'
import type { PiIssueChatMessage, PiIssueChatStatus } from '../../../../shared/pi-issue-chat-types'
import { cn } from '../../lib/utils'

/** One row in the voice-call transcript: chat bubbles, live reasoning, tools. */
export type VoiceCallLogEntry =
  | { id: string; role: 'user' | 'gemini' | 'report'; text: string; streaming: boolean }
  | { id: string; role: 'reasoning'; mid: string; text: string; streaming: boolean }
  | { id: string; role: 'tool' | 'system'; text: string; streaming: false }
  | { id: string; role: 'pi'; messages: PiIssueChatMessage[]; status: PiIssueChatStatus }

function LogRow({ entry }: { entry: VoiceCallLogEntry }): React.JSX.Element | null {
  if (entry.role === 'pi') {
    // Reuse the issue-chat renderer so reasoning/tools look and stream exactly
    // the same as the right-sidebar chat panel.
    const items = groupMessagesForRender(entry.messages)
    const lastReasoningId =
      entry.messages.toReversed().find((m) => m.role === 'reasoning')?.id ?? null
    return (
      <div className="flex flex-col gap-3">
        {items.map((item, i) => (
          <ChatMessageItem
            key={item.kind === 'message' ? item.message.id : `pi-tools-${i}`}
            item={item}
            status={entry.status}
            lastReasoningId={lastReasoningId}
          />
        ))}
      </div>
    )
  }
  if (entry.role === 'reasoning') {
    const message: PiIssueChatMessage = {
      id: entry.id,
      role: 'reasoning',
      content: entry.text,
      createdAt: 0
    }
    return <ReasoningBubble message={message} streaming={entry.streaming} />
  }
  if (entry.role === 'tool' || entry.role === 'system') {
    return <div className="px-1 font-mono text-[10px] text-muted-foreground">{entry.text}</div>
  }
  const isUser = entry.role === 'user'
  const isReport = entry.role === 'report'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground'
            : isReport
              ? 'border border-primary/30 bg-primary/5 text-foreground'
              : 'bg-muted text-foreground'
        )}
      >
        {isReport && (
          <div className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-primary">
            <Square className="h-2.5 w-2.5" /> Pi report
          </div>
        )}
        {entry.text}
      </div>
    </div>
  )
}

export function VoiceCallTranscript({
  log,
  scrollRef
}: {
  log: VoiceCallLogEntry[]
  scrollRef: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element {
  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      {log.length === 0 ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
          Bicara (mic) atau ketik perintah. Gemini menjawab dengan suara; aktifkan Coding mode untuk
          menugaskan Pi SDK.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {log.map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
