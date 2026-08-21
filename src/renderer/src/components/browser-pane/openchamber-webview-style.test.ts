import { describe, expect, it, vi } from 'vitest'

// Why: the module imports useAppStore only for the follow-poller; the reload
// guard under test must stay free of store coupling.
vi.mock('@/store', () => ({
  useAppStore: {
    getState: vi.fn(() => ({ getKnownWorktreeById: vi.fn(() => null) })),
    subscribe: vi.fn()
  }
}))

import {
  forceRecoverOpenChamber,
  hideOpenChamberOtherWorkspaces,
  injectOpenChamberMatchOverlay,
  isOpenChamberWebviewUrl,
  reloadOpenChamberWebview
} from './openchamber-webview-style'

// Why: tests exercise the guard contract, not the full Electron WebviewTag.
const webview = (reload: () => void): Electron.WebviewTag =>
  ({ reload }) as unknown as Electron.WebviewTag

const executingWebview = (
  executeJavaScript: (script: string) => Promise<unknown>
): Electron.WebviewTag =>
  ({ getURL: () => 'http://127.0.0.1:3001/', executeJavaScript }) as unknown as Electron.WebviewTag

describe('reloadOpenChamberWebview', () => {
  it('skips the reload before dom-ready so the page cannot crash', () => {
    const reload = vi.fn()
    reloadOpenChamberWebview(webview(reload), false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads once the guest is dom-ready', () => {
    const reload = vi.fn()
    reloadOpenChamberWebview(webview(reload), true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('swallows Electron reload throws (the prod crash: reload before dom-ready)', () => {
    const reload = vi.fn(() => {
      throw new Error(
        'The WebView must be attached to the DOM and the dom-ready event emitted before this method can be called.'
      )
    })
    expect(() => reloadOpenChamberWebview(webview(reload), true)).not.toThrow()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('tolerates a missing webview', () => {
    expect(() => reloadOpenChamberWebview(null, true)).not.toThrow()
  })
})

describe('isOpenChamberWebviewUrl', () => {
  it('accepts the loopback root and query-string deep links', () => {
    expect(isOpenChamberWebviewUrl('http://127.0.0.1:3210/')).toBe(true)
    expect(isOpenChamberWebviewUrl('http://127.0.0.1:3217/?session=ses_abc')).toBe(true)
    expect(isOpenChamberWebviewUrl('http://127.0.0.1:3217/?settings=projects')).toBe(true)
  })

  it('rejects non-OpenChamber hosts and Paseo paths', () => {
    expect(isOpenChamberWebviewUrl('https://example.com/')).toBe(false)
    expect(isOpenChamberWebviewUrl('http://127.0.0.1:3210/h/workspace/1')).toBe(false)
    expect(isOpenChamberWebviewUrl('http://localhost:5173/')).toBe(false)
  })
})

describe('forceRecoverOpenChamber', () => {
  it('kills, clears storage, restarts and reloads the same URL', async () => {
    const calls: string[] = []
    const api = {
      stopProject: vi.fn(async (path: string) => {
        calls.push(`stop:${path}`)
      }),
      clearStorage: vi.fn(async (path: string) => {
        calls.push(`clear:${path}`)
      }),
      start: vi.fn(async (path: string) => {
        calls.push(`start:${path}`)
        return { state: 'running', url: 'http://127.0.0.1:3311/', port: 3311, cwd: path }
      })
    }
    const loadURL = vi.fn(async () => undefined)
    const webview = {
      getURL: () => 'http://127.0.0.1:3311/',
      loadURL
    } as unknown as Electron.WebviewTag
    // Why: the helper reads window.api; stub it on a global window shim.
    const shim = { api: { openchamberWeb: api } } as unknown as Window
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = shim
    try {
      await forceRecoverOpenChamber(webview, '/work/orca')
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
    expect(calls).toEqual(['stop:/work/orca', 'clear:/work/orca', 'start:/work/orca'])
    expect(loadURL).toHaveBeenCalledWith('http://127.0.0.1:3311/')
  })

  it('re-pins lastDirectory after clearing storage and before load, so the SPA hydrates to the worktree', async () => {
    const api = {
      stopProject: vi.fn(async () => undefined),
      clearStorage: vi.fn(async () => undefined),
      start: vi.fn(async () => ({
        state: 'running',
        url: 'http://127.0.0.1:3311/',
        port: 3311,
        cwd: '/work/orca'
      }))
    }
    const executeJavaScript = vi.fn(async () => undefined)
    const loadURL = vi.fn(async () => undefined)
    const webview = {
      getURL: () => 'http://127.0.0.1:3311/',
      executeJavaScript,
      loadURL
    } as unknown as Electron.WebviewTag
    const shim = { api: { openchamberWeb: api } } as unknown as Window
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = shim
    try {
      await forceRecoverOpenChamber(webview, '/work/orca')
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
    expect(executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining("localStorage.setItem('lastDirectory'")
    )
    expect(executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining(JSON.stringify('/work/orca'))
    )
    expect(loadURL).toHaveBeenCalledWith('http://127.0.0.1:3311/')
  })

  it('falls back to reload when loadURL rejects', async () => {
    const api = {
      stopProject: vi.fn(async () => undefined),
      clearStorage: vi.fn(async () => undefined),
      start: vi.fn(async () => ({ state: 'running', url: null, port: 3311, cwd: '' }))
    }
    const loadURL = vi.fn(async () => {
      throw new Error('nav failed')
    })
    const reload = vi.fn()
    const webview = {
      getURL: () => 'http://127.0.0.1:3311/',
      loadURL,
      reload
    } as unknown as Electron.WebviewTag
    const shim = { api: { openchamberWeb: api } } as unknown as Window
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = shim
    try {
      await expect(forceRecoverOpenChamber(webview, '/work/orca')).resolves.toBeUndefined()
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('hideOpenChamberOtherWorkspaces', () => {
  it('skips non-OpenChamber URLs', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.resolve(undefined))
    const guest = {
      getURL: () => 'https://example.com',
      executeJavaScript
    } as unknown as Electron.WebviewTag
    hideOpenChamberOtherWorkspaces(guest, guest.getURL(), '/work/orca')
    expect(executeJavaScript).not.toHaveBeenCalled()
  })

  it('injects a filter script embedding the worktree path', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.resolve(undefined))
    hideOpenChamberOtherWorkspaces(
      executingWebview(executeJavaScript),
      'http://127.0.0.1:3001/',
      '/work/orca'
    )
    expect(executeJavaScript).toHaveBeenCalledTimes(1)
    const script = String(executeJavaScript.mock.calls[0][0])
    expect(script).toContain('/work/orca')
    expect(script).toContain('.oc-sidebar-scroller')
    expect(script).toContain('button.cursor-grab')
    expect(script).toContain('MutationObserver')
    expect(script).toContain('[aria-label*="add project" i]')
  })

  it('swallows executeJavaScript rejections', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.reject(new Error('guest crashed')))
    expect(() =>
      hideOpenChamberOtherWorkspaces(
        executingWebview(executeJavaScript),
        'http://127.0.0.1:3001/',
        '/work/orca'
      )
    ).not.toThrow()
  })
})

describe('injectOpenChamberMatchOverlay', () => {
  it('skips non-OpenChamber URLs', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.resolve(undefined))
    const guest = {
      getURL: () => 'https://example.com',
      executeJavaScript
    } as unknown as Electron.WebviewTag
    injectOpenChamberMatchOverlay(guest, guest.getURL(), '/work/orca')
    expect(executeJavaScript).not.toHaveBeenCalled()
  })

  it('injects an overlay script that polls lastDirectory and force-recovers on mismatch', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.resolve(undefined))
    injectOpenChamberMatchOverlay(
      executingWebview(executeJavaScript),
      'http://127.0.0.1:3001/',
      '/work/orca'
    )
    expect(executeJavaScript).toHaveBeenCalledTimes(1)
    const script = String(executeJavaScript.mock.calls[0][0])
    expect(script).toContain('/work/orca')
    expect(script).toContain('data-orca-oc-match')
    expect(script).toContain("localStorage.getItem('lastDirectory')")
    expect(script).toContain('setInterval')
    // direct force on mismatch (no re-pin+reload budget / auto-reload counters)
    expect(script).not.toContain('orcaOcAutoReloads')
    expect(script).toContain('force-recover')
    // retry timestamp throttle persists across reloads instead of a one-shot flag
    expect(script).toContain("sessionStorage.setItem('orcaOcLastForcedAt'")
    expect(script).toContain('orcaOcBootedAt')
    expect(script).toContain('orcaOcAutoReloaded')
    // click forces instead of re-pinning+reloading
    expect(script).toContain("guard.el.addEventListener('click'")
    // mismatch blocks input (keyboard + visual overlay) so nothing is typed
    // into the wrong project, and auto-reloads once before force-recover
    expect(script).toContain('data-orca-oc-blocker')
    expect(script).toContain('guard.blocked')
    expect(script).toContain('keydown')
    expect(script).toContain('input')
    expect(script).toContain('location.reload()')
    expect(script).toContain('autoReloaded')
    // bootedAt/autoReloaded persist in sessionStorage so a reload cannot reset
    // them and re-enter the auto-reload branch forever (blocker stuck)
    expect(script).toContain("sessionStorage.getItem('orcaOcBootedAt')")
    expect(script).toContain("sessionStorage.getItem('orcaOcAutoReloaded')")
  })

  it('swallows executeJavaScript rejections', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.reject(new Error('guest crashed')))
    expect(() =>
      injectOpenChamberMatchOverlay(
        executingWebview(executeJavaScript),
        'http://127.0.0.1:3001/',
        '/work/orca'
      )
    ).not.toThrow()
  })
})
