import { useAppStore } from '@/store'
import type { TopLevelView, TuiAgent } from '../../../shared/types'

/**
 * Agents that run as in-app web views (embedded browser UI) instead of
 * terminal TUIs. Selecting one from an agent picker must open its screen
 * rather than spawning `launchCmd` in a terminal.
 */
type WebViewTuiAgent = Extract<TuiAgent, TopLevelView>

const WEB_VIEW_TUI_AGENTS = new Set<WebViewTuiAgent>(['deepseek-harness', 'paseo', 'openchamber'])

// Why: settings may carry a placeholder ('blank') or stale agent id; accept
// unknown so callers never have to narrow before routing.
export function isWebViewTuiAgent(agent: unknown): agent is WebViewTuiAgent {
  return typeof agent === 'string' && WEB_VIEW_TUI_AGENTS.has(agent as WebViewTuiAgent)
}

/**
 * Route a web-view agent launch to its in-app screen (top-level view).
 * Returns true when the launch was consumed here and must not spawn.
 */
export function routeWebViewTuiAgent(agent: unknown): boolean {
  if (!isWebViewTuiAgent(agent)) {
    return false
  }
  useAppStore.getState().setActiveView(agent)
  return true
}
