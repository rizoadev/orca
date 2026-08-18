import { ListTree, Laptop } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { translate } from '@/i18n/i18n'
import {
  OrchestrationBoardTaskDialog,
  type OrchestrationBoardDetailLayout,
  type OrchestrationBoardMentionOption,
  type OrchestrationBoardTaskThread
} from './OrchestrationBoardTaskDialog'
import type { OrchestrationBoardTask } from './orchestration-board-model'
import { OrchestrationTaskLogs } from './OrchestrationTaskLogs'
import { OrchestrationSubtasksPanel } from './OrchestrationSubtasksPanel'

const EMPTY_SUBTASKS: OrchestrationBoardTask[] = []

export function OrchestrationBoardDetailPane({
  task,
  thread,
  threadLoading,
  commentDraft,
  commentSubmitting,
  selectedSquadId,
  squadsEmpty,
  assigning,
  actionBusy,
  repoLabel,
  mentionOptions,
  layout,
  autopilotBusy,
  onLayoutChange,
  onClose,
  onCommentDraftChange,
  onPostComment,
  onReply,
  onRefreshThread,
  onAssign,
  onRetry,
  onToggleAutopilot,
  onStop,
  onDelete,
  onOpenStageTask,
  subtasks = EMPTY_SUBTASKS,
  onOpenTask,
  onAddSubtask
}: {
  task: OrchestrationBoardTask
  thread: OrchestrationBoardTaskThread | null
  threadLoading: boolean
  commentDraft: string
  commentSubmitting: boolean
  selectedSquadId: string
  squadsEmpty: boolean
  assigning: boolean
  actionBusy: boolean
  repoLabel: string | null
  mentionOptions: OrchestrationBoardMentionOption[]
  layout: OrchestrationBoardDetailLayout
  autopilotBusy: boolean
  onLayoutChange: (layout: OrchestrationBoardDetailLayout) => void
  onClose: () => void
  onCommentDraftChange: (value: string) => void
  onPostComment: (parentId?: string | null) => void
  onReply: (comment: { id: string; author: string }) => void
  onRefreshThread: () => void
  onAssign: () => void
  onRetry: () => void
  onToggleAutopilot: (enabled: boolean) => void
  onStop: () => void
  onDelete: () => void
  onOpenStageTask: (taskId: string) => void
  subtasks?: OrchestrationBoardTask[]
  onOpenTask?: (task: OrchestrationBoardTask) => void
  onAddSubtask?: (title: string) => void
}): React.JSX.Element {
  return (
    <Tabs defaultValue="details" className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/60 px-4 pt-2">
        <TabsList className="h-9 w-full justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="details" className="px-3">
            {translate('auto.components.orchestration.board.detailTab', 'Details')}
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5 px-3">
            <Laptop className="size-3.5" />
            {translate('auto.components.orchestration.board.logsTab', 'Logs')}
          </TabsTrigger>
          <TabsTrigger value="subtasks" className="gap-1.5 px-3">
            <ListTree className="size-3.5" />
            {translate('auto.components.orchestration.board.subtasksTab', 'Subtasks')}
            {subtasks.length > 0 ? (
              <span className="tabular-nums text-muted-foreground">{subtasks.length}</span>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="details" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
        <OrchestrationBoardTaskDialog
          task={task}
          thread={thread}
          threadLoading={threadLoading}
          commentDraft={commentDraft}
          commentSubmitting={commentSubmitting}
          selectedSquadId={selectedSquadId}
          squadsEmpty={squadsEmpty}
          assigning={assigning}
          actionBusy={actionBusy}
          repoLabel={repoLabel}
          mentionOptions={mentionOptions}
          layout={layout === 'full' ? 'full' : layout === 'modal' ? 'modal' : 'split'}
          onLayoutChange={onLayoutChange}
          onClose={onClose}
          onCommentDraftChange={onCommentDraftChange}
          onPostComment={onPostComment}
          onReply={(comment) => onReply({ id: comment.id, author: comment.author })}
          onRefreshThread={onRefreshThread}
          onAssign={onAssign}
          onRetry={onRetry}
          onToggleAutopilot={onToggleAutopilot}
          onStop={onStop}
          onDelete={onDelete}
          onOpenStageTask={onOpenStageTask}
          autopilotBusy={autopilotBusy}
        />
      </TabsContent>
      <TabsContent value="logs" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
        <OrchestrationTaskLogs task={task} thread={thread} />
      </TabsContent>
      <TabsContent value="subtasks" className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden">
        {onOpenTask && onAddSubtask ? (
          <OrchestrationSubtasksPanel
            tasks={subtasks}
            rootTask={task}
            onOpenTask={onOpenTask}
            onAddSubtask={onAddSubtask}
          />
        ) : null}
      </TabsContent>
    </Tabs>
  )
}
