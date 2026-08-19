import {
  OrchestrationBoardTaskDialog,
  type OrchestrationBoardDetailLayout,
  type OrchestrationBoardMentionOption,
  type OrchestrationBoardTaskThread
} from './OrchestrationBoardTaskDialog'
import type { OrchestrationBoardTask } from './orchestration-board-model'

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
  onAddSubtask,
  parentTask,
  onOpenParent
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
  parentTask?: OrchestrationBoardTask | null
  onOpenParent?: () => void
}): React.JSX.Element {
  // Why: the task dialog owns its own tabs (Thread / Spec / Subtasks) so the
  // board detail is just a thin passthrough — no extra "Details" wrapper tab.
  return (
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
      subtasks={subtasks}
      onOpenTask={onOpenTask}
      onAddSubtask={onAddSubtask}
      parentTask={parentTask}
      onOpenParent={onOpenParent}
    />
  )
}
