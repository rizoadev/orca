import { afterEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  getState: vi.fn(),
  setActiveBrowserTab: vi.fn()
}))

const deepseek = vi.hoisted(() => ({
  getStatus: vi.fn(),
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

// Why: the helper calls window.api.deepseekWeb.* directly.
vi.stubGlobal('window', {
  api: {
    deepseekWeb: deepseek
  }
})

const browserTabsByWorktree: Record<string, { id: string; title: string; url: string }[]> = {}

describe('openDeepSeekHarnessTab idempotency', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('re-focuses an existing DeepSeek tab without spawning a duplicate, re-pointing the host cwd', async () => {
    const existingTab = {
      id: 'ws-deepseek',
      title: 'DeepSeek Harness',
      url: 'http://127.0.0.1:88/'
    }
    browserTabsByWorktree['wt-1'] = [existingTab]
    const createBrowserTab = vi.fn()
    deepseek.start.mockResolvedValue({ state: 'running', url: 'http://127.0.0.1:88/' })
    deepseek.getStatus.mockResolvedValue({ cwd: '/repo' })
    store.getState.mockReturnValue({
      browserTabsByWorktree,
      getKnownWorktreeById: vi.fn(() => ({ path: '/repo' })),
      setActiveBrowserTab: store.setActiveBrowserTab,
      createBrowserTab
    })

    const { openDeepSeekHarnessTab } = await import('./open-deepseek-harness-tab')

    await openDeepSeekHarnessTab('wt-1', 'main')

    expect(deepseek.start).toHaveBeenCalledWith('/repo')
    expect(store.setActiveBrowserTab).toHaveBeenCalledWith('ws-deepseek')
    expect(createBrowserTab).not.toHaveBeenCalled() // no duplicate tab spawned
  })
})
