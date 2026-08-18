import { useMemo } from 'react'
import { Laptop } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { AgentTerminalPreview } from '@/components/dashboard-popout/AgentTerminalPreview'
import type { OrchestrationBoardTask } from './orchestration-board-model'
import { collectOrchestrationTaskRunningAgents } from './orchestration-task-running-agents'
import type { OrchestrationBoardTaskThread } from './OrchestrationBoardTaskDialog'

export function OrchestrationTaskLogs({
  task,
  thread
}: {
  task: OrchestrationBoardTask
  thread: OrchestrationBoardTaskThread | null
}): React.JSX.Element {
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const runtimeAgentOrchestrationByPaneKey = useAppStore(
    (s) => s.runtimeAgentOrchestrationByPaneKey
  )
  const ptyIdsByTabId = useAppStore((s) => s.ptyIdsByTabId)
  const terminalLayoutsByTabId = useAppStore((s) => s.terminalLayoutsByTabId)

  const runningAgents = useMemo(
    () =>
      collectOrchestrationTaskRunningAgents({
        taskId: task.id,
        pipelineId: task.pipeline_id,
        worktreeId: task.worktree_id,
        allowWorktreeFallback:
          task.status === 'dispatched' || thread?.inCharge?.status === 'dispatched',
        assigneeHandles: [task.assignee_handle, thread?.inCharge?.handle],
        inCharge: thread?.inCharge,
        agentStatusByPaneKey,
        runtimeAgentOrchestrationByPaneKey
      }),
    [
      agentStatusByPaneKey,
      runtimeAgentOrchestrationByPaneKey,
      task.assignee_handle,
      task.id,
      task.pipeline_id,
      task.status,
      task.worktree_id,
      thread?.inCharge
    ]
  )

  const ptyId = useMemo(() => {
    if (runningAgents.length === 0) {
      return null
    }
    for (const agent of runningAgents) {
      const parsed = parsePaneKey(agent.paneKey)
      if (!parsed) {
        continue
      }
      const { tabId, leafId } = parsed
      // Why: layout entries survive restarts but their PTYs may not; only
      // advertise a pty the preview can serialize — ptyIdsByTabId is liveness
      // truth, matching the dashboard snapshot resolver.
      const layoutPtyId = terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId?.[leafId]
      if (layoutPtyId && (ptyIdsByTabId[tabId] ?? []).includes(layoutPtyId)) {
        return layoutPtyId
      }
    }
    return null
  }, [ptyIdsByTabId, runningAgents, terminalLayoutsByTabId])

  if (!ptyId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <Laptop className="size-7 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.orchestration.board.logs.noLive',
            'No live agent terminal for this task yet. Realtime output appears here while an agent runs.'
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-2 text-[11px] text-muted-foreground">
        <Laptop className="size-3.5" />
        {translate('auto.components.orchestration.board.logs.live', 'Live agent output')}
      </div>
      <div className="min-h-0 flex-1">
        <AgentTerminalPreview ptyId={ptyId} />
      </div>
    </div>
  )
}
