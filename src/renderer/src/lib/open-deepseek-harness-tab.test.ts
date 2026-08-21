import { afterEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  getState: vi.fn(),
  setActiveBrowserTab: vi.fn()
}))

const deepseek = vi.hoisted(() => ({
  start: vi.fn(),
  listSessions: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: store.getState,
    subscribe: vi.fn()
  }
}))

vi.mock('@/components/browser-pane/deepseek-webview-style', () => ({
  queueDeepSeekSession: vi.fn()
}))

vi.mock('@/components/browser-pane/paseo-webview-style', () => ({
  queuePaseoCwd: vi.fn(),
  queuePaseoWorkspaceSelection: vi.fn()
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

const browserTabsByWorktree: Record<string, { id: string; title: string; url: string }[]> = {}

describe('openDeepSeekHarnessTab idempotency', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('re-focuses an existing DeepSeek tab without spawning a duplicate', async () => {
    const existingTab = {
      id: 'ws-deepseek',
      title: 'DeepSeek Harness',
      url: 'http://127.0.0.1:88/'
    }
    browserTabsByWorktree['wt-1'] = [existingTab]
    const createBrowserTab = vi.fn()
    store.getState.mockReturnValue({
      browserTabsByWorktree,
      getKnownWorktreeById: vi.fn(() => ({ path: '/repo' })),
      setActiveBrowserTab: store.setActiveBrowserTab,
      createBrowserTab
    })

    const { openDeepSeekHarnessTab } = await import('./open-deepseek-harness-tab')

    await openDeepSeekHarnessTab('wt-1', 'main')

    expect(store.setActiveBrowserTab).toHaveBeenCalledWith('ws-deepseek')
    expect(deepseek.start).not.toHaveBeenCalled()
    expect(createBrowserTab).not.toHaveBeenCalled() // no duplicate tab spawned
  })
})
