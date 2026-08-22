import { create } from 'zustand'
import type { TuiAgent } from '../../../shared/types'
import { useAppStore } from '@/store'
import { isWebViewAgentTab } from '@/components/sidebar/worktree-available-webview-agent-rows'

/**
 * Per-worktree LLM activity for the sidebar's web-view agent rows (Paseo /
 * OpenChamber / DeepSeek Harness). A row shows a working dot while any session
 * of that worktree is streaming, and an idle grey dot otherwise.
 *
 * Sources per agent:
 * - Paseo: guest-side replica-cache poller (see paseo-agent-activity-script)
 *   pushing console markers; merged here on arrival.
 * - OpenChamber: /api/session/status is directory-scoped and omits idle
 *   sessions, so the main process polls it for candidate paths.
 * - DeepSeek: listSessions() already carries `cwd` + `running` per session.
 */
export type WebViewAgentActivityState = {
  /** path → working, reported by the embedded Paseo SPA. */
  paseoByPath: Record<string, boolean>
  /** path → working, from OpenChamber's directory-scoped status endpoint. */
  openchamberByPath: Record<string, boolean>
  /** path → working, derived from DeepSeek's running sessions. */
  deepseekByPath: Record<string, boolean>
}

const INITIAL: WebViewAgentActivityState = {
  paseoByPath: {},
  openchamberByPath: {},
  deepseekByPath: {}
}

const POLL_INTERVAL_MS = 5_000

export const useWebViewAgentActivity = create<WebViewAgentActivityState>(() => INITIAL)

/** Report guest-pushed Paseo activity (called by the console-marker listener). */
export function reportPaseoActivity(byPath: Record<string, boolean>): void {
  useWebViewAgentActivity.setState({ paseoByPath: byPath })
}

/**
 * Candidate worktree paths worth polling for one agent type — only those with
 * an open tab for it, since a row without its tab never renders.
 */
function candidatePaths(agentType: TuiAgent): string[] {
  const state = useAppStore.getState()
  const out = new Set<string>()
  for (const [worktreeId, tabs] of Object.entries(state.browserTabsByWorktree ?? {})) {
    if (!tabs?.some((tab) => isWebViewAgentTab(agentType, tab))) {
      continue
    }
    const path = state.getKnownWorktreeById(worktreeId)?.path
    if (path) {
      out.add(path)
    }
  }
  return [...out]
}

async function pollDaemonActivity(): Promise<void> {
  const deepseekPaths = candidatePaths('deepseek-harness')
  const openchamberPaths = candidatePaths('openchamber')
  const [deepseekSessions, busyDirectories] = await Promise.all([
    deepseekPaths.length > 0
      ? window.api.deepseekWeb.listSessions().catch(() => [])
      : Promise.resolve([]),
    openchamberPaths.length > 0
      ? window.api.openchamberWeb.listBusyDirectories(openchamberPaths).catch(() => [] as string[])
      : Promise.resolve([] as string[])
  ])
  const deepseekByPath: Record<string, boolean> = {}
  for (const session of deepseekSessions) {
    if (session.running && session.cwd) {
      deepseekByPath[session.cwd] = true
    }
  }
  const openchamberByPath: Record<string, boolean> = {}
  for (const path of openchamberPaths) {
    openchamberByPath[path] = busyDirectories.includes(path)
  }
  useWebViewAgentActivity.setState({ deepseekByPath, openchamberByPath })
}

let pollTimer: number | null = null

/** Start the shared activity poller. Idempotent — safe to call per card. */
export function ensureWebViewAgentDaemonPolling(): void {
  if (pollTimer !== null) {
    return
  }
  void pollDaemonActivity()
  pollTimer = window.setInterval(() => {
    void pollDaemonActivity()
  }, POLL_INTERVAL_MS)
}
