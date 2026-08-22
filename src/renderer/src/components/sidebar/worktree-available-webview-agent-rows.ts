import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { BrowserWorkspace, TuiAgent } from '../../../../shared/types'

// Why: paseo & deepseek-harness run as embedded web views (never terminal
// panes), so they produce no hook agent-status entries. They surface as rows
// in the worktree card agents list only while a browser-tab session for that
// agent is open in the worktree (see openWebViewAgentTypes) — idle worktrees
// without a session never show the launcher.
export const AVAILABLE_WEBVIEW_AGENTS: readonly TuiAgent[] = [
  'deepseek-harness',
  'reasonix',
  'paseo',
  'openchamber'
]

// Why: tab title is the launch-time marker, but the Paseo daemon overwrites it
// with its own <title> once the page loads, so we also match its stable URL
// route (/h/ host path) — the same pattern paseo-webview-style uses. DeepSeek
// Harness serves its SPA without a <title>, so its launch title survives.
const WEBVIEW_AGENT_TAB_TITLE: Partial<Record<TuiAgent, string>> = {
  'deepseek-harness': 'DeepSeek Harness',
  reasonix: 'Reasonix',
  paseo: 'Paseo',
  openchamber: 'OpenChamber'
}

const PASEO_WEB_URL_PATTERN = /^http:\/\/127\.0\.0\.1:\d+\/h\//

function isOpenBrowserSession(agentType: TuiAgent, tab: BrowserWorkspace): boolean {
  // Why: the stamped marker is authoritative — it survives SPA title
  // overwrites and disambiguates app-like tabs that share hideBrowserChrome.
  // Title/URL remain fallbacks for tabs created before the marker existed.
  if (tab.webViewAgentType === agentType) {
    return true
  }
  if (tab.title === (WEBVIEW_AGENT_TAB_TITLE[agentType] ?? '')) {
    return true
  }
  if (agentType === 'paseo') {
    return PASEO_WEB_URL_PATTERN.test(tab.url)
  }
  return false
}

/**
 * Whether the given browser tab is the web-view session for `agentType`.
 * Shared by the sidebar row detection and the open-* helpers so both agree on
 * what counts as an existing session (and therefore re-focus instead of
 * spawning a duplicate tab).
 */
export function isWebViewAgentTab(agentType: TuiAgent, tab: BrowserWorkspace): boolean {
  return isOpenBrowserSession(agentType, tab)
}

/**
 * The web-view agents that currently have an open browser-tab session in the
 * worktree. An agent with no open tab is omitted, so its launcher row is
 * never shown for that worktree.
 */
export function openWebViewAgentTypes(tabs: readonly BrowserWorkspace[]): TuiAgent[] {
  return AVAILABLE_WEBVIEW_AGENTS.filter((agentType) =>
    tabs.some((tab) => isOpenBrowserSession(agentType, tab))
  )
}
/**
 * Synthetic idle rows for web-view agents. `tab` is intentionally absent —
 * clicking routes to the embedded web view instead of a terminal pane.
 *
 * @param availableAgentTypes Rows to emit; pass the output of
 *   openWebViewAgentTypes so only agents with an open session appear.
 */
export function buildAvailableWebViewAgentRows(
  worktreeId: string,
  now: number,
  availableAgentTypes: readonly TuiAgent[] = AVAILABLE_WEBVIEW_AGENTS,
  agentWorking: Readonly<Partial<Record<TuiAgent, boolean>>> = {}
): DashboardAgentRow[] {
  return availableAgentTypes.map((agentType) => {
    const paneKey = `available:${agentType}:${worktreeId}`
    const entry: AgentStatusEntry = {
      // Why: AgentStatusState has no 'idle'; 'waiting' is the neutral alive-but-inactive state.
      state: 'waiting',
      prompt: '',
      updatedAt: now,
      stateStartedAt: now,
      agentType,
      paneKey,
      worktreeId,
      stateHistory: [{ state: 'waiting', prompt: '', startedAt: now }]
    }
    return {
      paneKey,
      entry,
      agentType,
      rowSource: 'available',
      // Why: the dot mirrors LLM activity — a streaming session in this
      // worktree shows the working spinner, otherwise the row stays idle.
      state: agentWorking[agentType] === true ? 'working' : 'idle',
      startedAt: 0
    }
  })
}
