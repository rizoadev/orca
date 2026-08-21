import { describe, expect, it } from 'vitest'
import type { BrowserWorkspace } from '../../../../shared/types'
import {
  buildAvailableWebViewAgentRows,
  openWebViewAgentTypes
} from './worktree-available-webview-agent-rows'

function makeBrowserTab(title: string, overrides?: Partial<BrowserWorkspace>): BrowserWorkspace {
  return {
    id: `tab-${title}`,
    worktreeId: 'wt-1',
    url: 'http://127.0.0.1:1/',
    title,
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 0,
    ...overrides
  }
}

describe('openWebViewAgentTypes', () => {
  it('returns no agents when the worktree has no open browser tabs', () => {
    expect(openWebViewAgentTypes([])).toEqual([])
  })

  it('returns only Paseo when only a Paseo tab is open', () => {
    expect(openWebViewAgentTypes([makeBrowserTab('Paseo')])).toEqual(['paseo'])
  })

  it('returns only DeepSeek Harness when only a DeepSeek tab is open', () => {
    expect(openWebViewAgentTypes([makeBrowserTab('DeepSeek Harness')])).toEqual([
      'deepseek-harness'
    ])
  })

  it('matches Paseo by its /h/ URL even when the daemon overwrote the tab title', () => {
    expect(
      openWebViewAgentTypes([
        makeBrowserTab('Some Daemon Title', {
          url: 'http://127.0.0.1:4747/h/srv/workspace/wsp'
        })
      ])
    ).toEqual(['paseo'])
  })

  it('matches DeepSeek by its stamped marker when the SPA overwrote the title', () => {
    expect(
      openWebViewAgentTypes([
        makeBrowserTab('Some Daemon Title', { webViewAgentType: 'deepseek-harness' })
      ])
    ).toEqual(['deepseek-harness'])
  })

  it('does not treat a plain app-like tab as a web-view agent without the marker', () => {
    // Why: hideBrowserChrome is shared by every app-like tab; without the
    // stamped webViewAgentType it must not match any agent.
    expect(
      openWebViewAgentTypes([makeBrowserTab('Some Daemon Title', { hideBrowserChrome: true })])
    ).toEqual([])
  })

  it('matches OpenChamber by its stamped marker only', () => {
    expect(
      openWebViewAgentTypes([makeBrowserTab('Chamber UI', { webViewAgentType: 'openchamber' })])
    ).toEqual(['openchamber'])
  })

  it('returns both agents when both sessions are open', () => {
    expect(
      openWebViewAgentTypes([makeBrowserTab('Paseo'), makeBrowserTab('DeepSeek Harness')])
    ).toEqual(['deepseek-harness', 'paseo'])
  })

  it('ignores unrelated browser tabs (e.g. a plain browser)', () => {
    expect(openWebViewAgentTypes([makeBrowserTab('Browser 1')])).toEqual([])
  })
})

describe('buildAvailableWebViewAgentRows', () => {
  it('emits a row per available agent type with the worktree-scoped pane key', () => {
    const rows = buildAvailableWebViewAgentRows('wt-1', 1000, ['paseo'])

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      agentType: 'paseo',
      rowSource: 'available',
      paneKey: 'available:paseo:wt-1'
    })
    expect(rows[0].entry.worktreeId).toBe('wt-1')
  })

  it('emits no rows when no agent session is open', () => {
    expect(buildAvailableWebViewAgentRows('wt-1', 1000, [])).toEqual([])
  })

  it('defaults to every web-view agent when no filter is given', () => {
    const rows = buildAvailableWebViewAgentRows('wt-1', 1000)

    expect(rows.map((row) => row.agentType)).toEqual(['deepseek-harness', 'paseo', 'openchamber'])
  })
})
