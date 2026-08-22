import { useMemo, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import type { TuiAgent } from '../../../../shared/types'
import { applyAgentRowLineage } from '@/components/dashboard/agent-row-lineage'
import { migrationUnsupportedToAgentStatusEntry } from '@/lib/migration-unsupported-agent-entry'
import { useAppStore } from '@/store'
import {
  selectLivePtyIdsForWorktree,
  selectRuntimePaneTitlesForWorktree
} from './worktree-card-status-inputs'
import { buildWorktreeAgentRows } from './worktree-agent-rows'
import {
  selectLiveAgentStatusEntriesForWorktree,
  selectMigrationUnsupportedEntriesForWorktree,
  selectRuntimeAgentOrchestrationForWorktree,
  selectRetainedAgentEntriesForWorktree,
  selectTerminalLayoutsForWorktree
} from './worktree-agent-row-selectors'
import {
  createWorktreeAgentFreshnessSelector,
  EMPTY_WORKTREE_AGENT_FRESHNESS_SIGNATURE
} from './worktree-agent-freshness-selector'
import {
  buildAvailableWebViewAgentRows,
  openWebViewAgentTypes
} from './worktree-available-webview-agent-rows'
import {
  ensureWebViewAgentDaemonPolling,
  useWebViewAgentActivity
} from '@/lib/webview-agent-daemon-status'

export { buildWorktreeAgentRows } from './worktree-agent-rows'
export {
  selectLiveAgentStatusEntriesForWorktree,
  selectMigrationUnsupportedEntriesForWorktree,
  selectRuntimeAgentOrchestrationForWorktree,
  selectRetainedAgentEntriesForWorktree
} from './worktree-agent-row-selectors'

/**
 * Narrow per-worktree agent row hook used by the WorktreeCard inline agents list.
 * Uses indexed per-worktree selectors rather than reusing useDashboardData's
 * cross-worktree aggregate — the index is rebuilt once per relevant immutable
 * store slice and shared by every visible card, avoiding O(cards × agents)
 * selector work on high-frequency agent status pings.
 */
export function useWorktreeAgentRows(worktreeId: string, active = true): DashboardAgentRow[] {
  const selectAgentFreshness = useMemo(
    () => createWorktreeAgentFreshnessSelector(worktreeId),
    [worktreeId]
  )
  const tabs = useAppStore((s) => (active ? s.tabsByWorktree[worktreeId] : undefined))
  // Why: web-view agents (Paseo/DeepSeek) live in browser tabs; only agents
  // with an open tab get a launcher row, so idle worktrees show neither.
  // Why: keep the selector to a stable stored reference (no `?? []` fallback) —
  // a fresh array each render would trip zustand's shallow-equality re-render.
  const browserTabs = useAppStore((s) =>
    active ? s.browserTabsByWorktree?.[worktreeId] : undefined
  )
  const openWebViewAgents = useMemo(
    () => (browserTabs ? openWebViewAgentTypes(browserTabs) : []),
    [browserTabs]
  )
  // Why: the daemon-status poller is a single app-wide timer; starting it here
  // (per card) is guarded by an idempotent module flag, so it runs exactly once.
  useEffect(() => {
    if (active) {
      ensureWebViewAgentDaemonPolling()
    }
  }, [active])
  const activity = useWebViewAgentActivity(useShallow((s) => s))
  // Why: the dot mirrors LLM activity per worktree — working while any session
  // of this worktree streams, idle otherwise. OpenChamber/DeepSeek keys are
  // polled; Paseo arrives pushed from its embedded SPA. The path is stable per
  // worktreeId, so a non-reactive read here is safe.
  const daemonRunning = useMemo<Partial<Record<TuiAgent, boolean>>>(() => {
    const path = useAppStore.getState().getKnownWorktreeById(worktreeId)?.path
    if (!path) {
      return {}
    }
    return {
      paseo: activity.paseoByPath[path] === true,
      openchamber: activity.openchamberByPath[path] === true,
      'deepseek-harness': activity.deepseekByPath[path] === true,
      reasonix: activity.reasonixByPath[path] === true
    }
  }, [activity, worktreeId])
  // Why: narrow the subscriptions to only THIS worktree's entries via
  // useShallow. Subscribing to the whole agentStatusByPaneKey map would make
  // every on-screen card re-render on any agent-status update anywhere —
  // O(worktrees²) render amplification. Pre-filtering here means the card
  // only re-renders when something relevant to THIS worktree changes.
  const liveEntries = useAppStore(
    useShallow((s) => (active ? selectLiveAgentStatusEntriesForWorktree(s, worktreeId) : []))
  )
  // Why: keep the store selector limited to stable raw records. Converting
  // migration entries creates fresh objects with Date.now(), which breaks
  // useSyncExternalStore's cached-snapshot contract and can blank Electron.
  const migrationUnsupported = useAppStore(
    useShallow((s) => (active ? selectMigrationUnsupportedEntriesForWorktree(s, worktreeId) : []))
  )
  const retained = useAppStore(
    useShallow((s) => (active ? selectRetainedAgentEntriesForWorktree(s, worktreeId) : []))
  )
  const runtimePaneTitlesByTabId = useAppStore(
    useShallow((s) => (active ? selectRuntimePaneTitlesForWorktree(s, worktreeId) : {}))
  )
  const ptyIdsByTabId = useAppStore(
    useShallow((s) => (active ? selectLivePtyIdsForWorktree(s, worktreeId) : {}))
  )
  const terminalLayoutsByTabId = useAppStore(
    useShallow((s) => (active ? selectTerminalLayoutsForWorktree(s, worktreeId) : {}))
  )
  const runtimeAgentOrchestrationByPaneKey = useAppStore(
    useShallow((s) => (active ? selectRuntimeAgentOrchestrationForWorktree(s, worktreeId) : {}))
  )
  const agentFreshnessSignature = useAppStore((s) =>
    active ? selectAgentFreshness(s) : EMPTY_WORKTREE_AGENT_FRESHNESS_SIGNATURE
  )

  return useMemo<DashboardAgentRow[]>(() => {
    if (!active) {
      return []
    }
    // Why: Date.now() is read inside the memo so stale-decay recalculates when
    // this worktree's freshness signature changes, even without new PTY data.
    const now = Date.now()
    const entries =
      migrationUnsupported.length > 0
        ? [
            ...liveEntries,
            ...migrationUnsupported.flatMap((unsupported) => {
              const entry = migrationUnsupportedToAgentStatusEntry(unsupported)
              return entry ? [entry] : []
            })
          ]
        : liveEntries
    return [
      ...applyAgentRowLineage(
        buildWorktreeAgentRows({
          tabs: tabs ?? [],
          entries,
          retained,
          runtimePaneTitlesByTabId,
          ptyIdsByTabId,
          terminalLayoutsByTabId,
          runtimeAgentOrchestrationByPaneKey,
          now
        })
      ),
      // Why: launcher rows exist only while a browser-tab session for that
      // agent is open in the worktree (see openWebViewAgentTypes).
      ...(openWebViewAgents.length > 0
        ? buildAvailableWebViewAgentRows(worktreeId, now, openWebViewAgents, daemonRunning)
        : [])
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    active,
    tabs,
    openWebViewAgents,
    liveEntries,
    migrationUnsupported,
    retained,
    runtimePaneTitlesByTabId,
    ptyIdsByTabId,
    terminalLayoutsByTabId,
    runtimeAgentOrchestrationByPaneKey,
    agentFreshnessSignature,
    daemonRunning
  ])
}
