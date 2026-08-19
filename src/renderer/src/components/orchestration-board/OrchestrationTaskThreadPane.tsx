import { useMemo, useRef, useState } from 'react'
import { LoaderCircle, MessageSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { OrchestrationBoardComment } from './orchestration-board-model'
import type { OrchestrationBoardMentionOption } from './OrchestrationBoardTaskDialog'

type ThreadFilter = 'all' | 'comment' | 'result' | 'dispatch' | 'system'

const KIND_BADGE: Record<string, string> = {
  comment: 'bg-muted text-muted-foreground',
  result: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  dispatch: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  system: 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
}

export function OrchestrationTaskThreadPane({
  comments,
  loading,
  commentDraft,
  commentSubmitting,
  mentionOptions,
  onCommentDraftChange,
  onPostComment,
  onReply
}: {
  comments: OrchestrationBoardComment[]
  loading: boolean
  commentDraft: string
  commentSubmitting: boolean
  mentionOptions: OrchestrationBoardMentionOption[]
  onCommentDraftChange: (value: string) => void
  onPostComment: (parentId?: string | null) => void
  onReply: (comment: OrchestrationBoardComment) => void
}): React.JSX.Element {
  const [filter, setFilter] = useState<ThreadFilter>('all')
  const [replyTo, setReplyTo] = useState<OrchestrationBoardComment | null>(null)
  const commentRef = useRef<HTMLTextAreaElement | null>(null)

  const insertMention = (insert: string): void => {
    const el = commentRef.current
    const token = insert.startsWith('@') ? `${insert} ` : `@${insert} `
    if (!el) {
      onCommentDraftChange(`${commentDraft}${token}`)
      return
    }
    const start = el.selectionStart ?? commentDraft.length
    const end = el.selectionEnd ?? start
    const next = `${commentDraft.slice(0, start)}${token}${commentDraft.slice(end)}`
    onCommentDraftChange(next)
    requestAnimationFrame(() => {
      const pos = start + token.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  const filteredComments = useMemo(() => {
    if (filter === 'all') {
      return comments
    }
    return comments.filter((c) => c.kind === filter)
  }, [comments, filter])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/40 px-4 py-2">
        {(
          [
            ['all', 'All'],
            ['result', 'Results'],
            ['comment', 'Comments'],
            ['dispatch', 'Dispatches'],
            ['system', 'System']
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
              filter === id
                ? 'bg-foreground text-background'
                : 'bg-muted/50 text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {translate(`auto.components.orchestration.board.filter.${id}`, label)}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4 scrollbar-sleek sm:p-5">
        {loading && comments.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {translate('auto.components.orchestration.board.threadLoading', 'Loading thread…')}
          </div>
        ) : null}
        {!loading && comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <MessageSquare className="size-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {translate(
                'auto.components.orchestration.board.threadEmpty',
                'No comments yet. Dispatch results post here automatically.'
              )}
            </p>
          </div>
        ) : null}
        {filteredComments.map((comment) => (
          <article
            key={comment.id}
            className={cn(
              'rounded-lg border border-border/50 bg-card px-3 py-2.5 shadow-sm',
              comment.kind === 'result' && 'border-emerald-500/20 bg-emerald-500/[0.04]',
              comment.kind === 'dispatch' && 'border-sky-500/20 bg-sky-500/[0.04]',
              comment.kind === 'system' && 'border-amber-500/20 bg-amber-500/[0.04]'
            )}
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  KIND_BADGE[comment.kind] ?? KIND_BADGE.comment
                )}
              >
                {comment.kind}
              </span>
              <span className="font-mono text-[11px] font-medium">{comment.author}</span>
              {comment.role ? (
                <span className="text-[11px] capitalize text-muted-foreground">{comment.role}</span>
              ) : null}
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                {comment.created_at?.replace('T', ' ').slice(0, 19)}
              </span>
            </div>
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
              {comment.body}
            </div>
            {comment.kind === 'comment' || comment.kind === 'result' ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => {
                    setReplyTo(comment)
                    onReply(comment)
                  }}
                >
                  {translate('auto.components.orchestration.board.reply', 'Reply')}
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="shrink-0 border-t border-border/60 bg-card/95 p-3 sm:p-4">
        {replyTo ? (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5 text-[11px]">
            <span className="text-muted-foreground">
              {translate('auto.components.orchestration.board.replyingTo', 'Replying to')}
            </span>
            <span className="font-mono">{replyTo.author}</span>
            <button
              type="button"
              className="ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => setReplyTo(null)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        {mentionOptions.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {translate('auto.components.orchestration.board.mention', 'Mention')}
            </span>
            {mentionOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => insertMention(option.insert)}
                className={cn(
                  'rounded-full border border-border/60 px-2 py-0.5 text-[11px] transition-colors',
                  'hover:bg-accent hover:text-foreground',
                  option.kind === 'squad' && 'border-sky-500/30 text-sky-700 dark:text-sky-400',
                  option.kind === 'role' &&
                    'border-violet-500/30 text-violet-700 dark:text-violet-400',
                  option.kind === 'agent' && 'font-mono'
                )}
                title={option.insert}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <textarea
            ref={commentRef}
            value={commentDraft}
            onChange={(event) => onCommentDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                onPostComment(replyTo?.id ?? null)
              }
            }}
            rows={3}
            placeholder={translate(
              'auto.components.orchestration.board.commentPlaceholder',
              'Comment + @agent / @squad:name — posts re-assign the manager AI (⌘/Ctrl+Enter)'
            )}
            className={cn(
              'min-h-[72px] flex-1 resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none',
              'placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              'dark:bg-input/30'
            )}
          />
          <Button
            type="button"
            className="self-end"
            disabled={commentSubmitting || !commentDraft.trim()}
            onClick={() => onPostComment(replyTo?.id ?? null)}
          >
            {commentSubmitting ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {translate('auto.components.orchestration.board.commentPost', 'Post & assign')}
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {translate(
            'auto.components.orchestration.board.commentNotifyHint',
            'Posts notify the in-charge agent (or @mentions) and reopen finished tasks.'
          )}
        </p>
      </div>
    </div>
  )
}
