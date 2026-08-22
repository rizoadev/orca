import { create } from 'zustand'
import type { OpenChamberProjectStatus } from '../../../shared/openchamber-web-types'

// Why: the sidebar's available web-view rows (Paseo/OpenChamber/DeepSeek) are
// synthetic idle rows; this store tracks whether each embedded daemon is
// actually running so the row can switch from a grey idle dot to a yellow
// running dot. A single module-level poller serves every worktree card.
//
// Paseo and DeepSeek Harness run ONE daemon for every worktree, so one global
// boolean each is accurate. OpenChamber spawns a server PER PROJECT, and its
// getStatus() only reports the active project — so its running state must be
// resolved per worktree path via listProjects().
export type WebViewAgentDaemonStatus = {
  paseo: boolean
  'deepseek-harness': boolean
  /** Per-worktree OpenChamber running state, keyed by project (worktree) path. */
  openchamberByPath: Record<string, boolean>
  /** True once the first poll has resolved, so callers can distinguish "not running" from "unknown". */
  started: boolean
}

const INITIAL: WebViewAgentDaemonStatus = {
  paseo: false,
  'deepseek-harness': false,
  openchamberByPath: {},
  started: false
}

const POLL_INTERVAL_MS = 5_000

export const useWebViewAgentDaemonStatus = create<WebViewAgentDaemonStatus>(() => INITIAL)

let pollTimer: number | null = null

async function refreshDaemonStatus(): Promise<void> {
  const [paseo, deepseek, openchamberProjects] = await Promise.all([
    window.api.paseo.getStatus().catch(() => null),
    window.api.deepseekWeb.getStatus().catch(() => null),
    window.api.openchamberWeb.listProjects().catch(() => [] as OpenChamberProjectStatus[])
  ])
  // Why: listProjects covers every known worktree, so a row can look up its
  // own server's state instead of the active project's.
  const openchamberByPath: Record<string, boolean> = {}
  if (Array.isArray(openchamberProjects)) {
    for (const project of openchamberProjects) {
      openchamberByPath[project.projectPath] = project.state === 'running'
    }
  }
  useWebViewAgentDaemonStatus.setState({
    paseo: paseo?.state === 'running',
    'deepseek-harness': deepseek?.state === 'running',
    openchamberByPath,
    started: true
  })
}

/** Start the shared daemon-status poller. Idempotent — safe to call per card. */
export function ensureWebViewAgentDaemonPolling(): void {
  if (pollTimer !== null) {
    return
  }
  void refreshDaemonStatus()
  pollTimer = window.setInterval(() => {
    void refreshDaemonStatus()
  }, POLL_INTERVAL_MS)
}
