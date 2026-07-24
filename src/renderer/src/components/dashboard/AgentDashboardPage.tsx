/**
 * In-app Agent Dashboard (main content area), not a separate Electron window.
 */
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { AgentKanbanBoard } from '@/components/dashboard-popout/AgentKanbanBoard'
import { buildDashboardSnapshot } from './build-dashboard-snapshot'
import { useNow } from './useNow'

export default function AgentDashboardPage(): React.JSX.Element {
  const now = useNow(15_000)
  const {
    repos,
    worktreesByRepo,
    tabsByWorktree,
    agentStatusByPaneKey,
    retainedAgentsByPaneKey,
    migrationUnsupportedByPtyId,
    runtimeAgentOrchestrationByPaneKey,
    terminalLayoutsByTabId,
    ptyIdsByTabId,
    runtimePaneTitlesByTabId,
    acknowledgedAgentsByPaneKey,
    agentStatusEpoch
  } = useAppStore(
    useShallow((s) => ({
      repos: s.repos,
      worktreesByRepo: s.worktreesByRepo,
      tabsByWorktree: s.tabsByWorktree,
      agentStatusByPaneKey: s.agentStatusByPaneKey,
      retainedAgentsByPaneKey: s.retainedAgentsByPaneKey,
      migrationUnsupportedByPtyId: s.migrationUnsupportedByPtyId,
      runtimeAgentOrchestrationByPaneKey: s.runtimeAgentOrchestrationByPaneKey,
      terminalLayoutsByTabId: s.terminalLayoutsByTabId,
      ptyIdsByTabId: s.ptyIdsByTabId,
      runtimePaneTitlesByTabId: s.runtimePaneTitlesByTabId,
      acknowledgedAgentsByPaneKey: s.acknowledgedAgentsByPaneKey,
      agentStatusEpoch: s.agentStatusEpoch
    }))
  )

  const snapshot = useMemo(
    () =>
      buildDashboardSnapshot(
        {
          repos,
          worktreesByRepo,
          tabsByWorktree,
          agentStatusByPaneKey,
          retainedAgentsByPaneKey,
          migrationUnsupportedByPtyId,
          runtimeAgentOrchestrationByPaneKey,
          terminalLayoutsByTabId,
          ptyIdsByTabId,
          runtimePaneTitlesByTabId,
          acknowledgedAgentsByPaneKey
        },
        now
      ),
    // Why: agentStatusEpoch drives idle-decay / freshness without map identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      repos,
      worktreesByRepo,
      tabsByWorktree,
      agentStatusByPaneKey,
      retainedAgentsByPaneKey,
      migrationUnsupportedByPtyId,
      runtimeAgentOrchestrationByPaneKey,
      terminalLayoutsByTabId,
      ptyIdsByTabId,
      runtimePaneTitlesByTabId,
      acknowledgedAgentsByPaneKey,
      agentStatusEpoch,
      now
    ]
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <AgentKanbanBoard snapshot={snapshot} className="h-full w-full max-w-none" />
    </div>
  )
}
