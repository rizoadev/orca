import { describe, expect, it, vi } from 'vitest'

// Why: the module imports useAppStore only for the follow-poller; the overlay
// and recover helpers under test must stay free of store coupling.
vi.mock('@/store', () => ({
  useAppStore: {
    getState: vi.fn(() => ({ getKnownWorktreeById: vi.fn(() => null) })),
    subscribe: vi.fn()
  }
}))

import {
  forceRecoverPaseo,
  injectPaseoMatchOverlay,
  pollPaseoDirectorySync
} from './paseo-webview-match'
import { isPaseoWebviewUrl } from './paseo-webview-style'

const executingWebview = (
  executeJavaScript: (script: string) => Promise<unknown>
): Electron.WebviewTag =>
  ({
    getURL: () => 'http://127.0.0.1:6768/h/srv_1/workspace/wks_1',
    executeJavaScript
  }) as unknown as Electron.WebviewTag

describe('isPaseoWebviewUrl', () => {
  it('accepts the /h/ host routes of the Paseo web app', () => {
    expect(isPaseoWebviewUrl('http://127.0.0.1:6768/h/srv_1/workspace/wks_1')).toBe(true)
    expect(isPaseoWebviewUrl('http://127.0.0.1:6768/h/srv_1/sessions')).toBe(true)
  })

  it('rejects loopback roots, OpenChamber hosts and external URLs', () => {
    expect(isPaseoWebviewUrl('http://127.0.0.1:6768/')).toBe(false)
    expect(isPaseoWebviewUrl('http://127.0.0.1:3210/?session=ses_abc')).toBe(false)
    expect(isPaseoWebviewUrl('https://app.paseo.sh/')).toBe(false)
  })
})

describe('injectPaseoMatchOverlay', () => {
  it('skips non-Paseo URLs', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.resolve(undefined))
    const guest = {
      getURL: () => 'https://example.com',
      executeJavaScript
    } as unknown as Electron.WebviewTag
    injectPaseoMatchOverlay(guest, guest.getURL(), '/work/orca')
    expect(executeJavaScript).not.toHaveBeenCalled()
  })

  it('injects an overlay script that checks the pinned workspace and force-recovers on mismatch', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.resolve(undefined))
    injectPaseoMatchOverlay(
      executingWebview(executeJavaScript),
      'http://127.0.0.1:6768/h/srv_1/workspace/wks_1',
      '/work/orca'
    )
    expect(executeJavaScript).toHaveBeenCalledTimes(1)
    const script = String(executeJavaScript.mock.calls[0][0])
    expect(script).toContain('/work/orca')
    expect(script).toContain('data-orca-paseo-match')
    expect(script).toContain('paseo:last-workspace-route-selection')
    expect(script).toContain('@paseo:replica-cache')
    expect(script).toContain('setInterval')
    expect(script).toContain('[orca:paseo] force-recover')
    expect(script).toContain("sessionStorage.setItem('orcaPaseoForceSignaled', '1')")
    expect(script).toContain("guard.el.addEventListener('click'")
  })

  it('swallows executeJavaScript rejections', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.reject(new Error('guest crashed')))
    expect(() =>
      injectPaseoMatchOverlay(
        executingWebview(executeJavaScript),
        'http://127.0.0.1:6768/h/srv_1/workspace/wks_1',
        '/work/orca'
      )
    ).not.toThrow()
  })
})

describe('forceRecoverPaseo', () => {
  it('restarts the daemon, re-attaches the project, re-pins the selection and loads the workspace route', async () => {
    const calls: string[] = []
    const api = {
      start: vi.fn(async () => {
        calls.push('start')
        return { state: 'running', url: 'http://127.0.0.1:6768', port: 6768 }
      }),
      attachProject: vi.fn(async (path: string) => {
        calls.push(`attach:${path}`)
        return { workspaceId: 'wks_9', serverId: 'srv_9' }
      })
    }
    const executeJavaScript = vi.fn(async () => undefined)
    const loadURL = vi.fn(async () => undefined)
    const webview = {
      getURL: () => 'http://127.0.0.1:6768/h/srv_1/workspace/wks_1',
      executeJavaScript,
      loadURL
    } as unknown as Electron.WebviewTag
    const shim = { api: { paseo: api } } as unknown as Window
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = shim
    try {
      await forceRecoverPaseo(webview, '/work/orca')
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
    expect(calls).toEqual(['start', 'attach:/work/orca'])
    // Why: the selection must be written BEFORE load so the fresh page
    // hydrates onto the re-attached workspace instead of a stale one.
    expect(executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining("localStorage.setItem('paseo:last-workspace-route-selection'")
    )
    // Why: the selection is double-encoded — the stored value must be the JSON
    // text (escaped quotes in the guest script literal), not a raw object.
    expect(executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('\\"serverId\\":\\"srv_9\\"')
    )
    expect(executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('\\"workspaceId\\":\\"wks_9\\"')
    )
    expect(loadURL).toHaveBeenCalledWith('http://127.0.0.1:6768/h/srv_9/workspace/wks_9')
  })

  it('falls back to reload when loadURL rejects', async () => {
    const api = {
      start: vi.fn(async () => ({ state: 'running', url: null, port: 6768 })),
      attachProject: vi.fn(async () => ({ workspaceId: 'wks_9', serverId: 'srv_9' }))
    }
    const loadURL = vi.fn(async () => {
      throw new Error('nav failed')
    })
    const reload = vi.fn()
    const webview = {
      getURL: () => 'http://127.0.0.1:6768/h/srv_1/workspace/wks_1',
      loadURL,
      reload
    } as unknown as Electron.WebviewTag
    const shim = { api: { paseo: api } } as unknown as Window
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = shim
    try {
      await expect(forceRecoverPaseo(webview, '/work/orca')).resolves.toBeUndefined()
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('pollPaseoDirectorySync', () => {
  it('skips a missing webview', async () => {
    const shim = {
      api: { paseo: { getStatus: vi.fn(), start: vi.fn(), attachProject: vi.fn() } }
    } as unknown as Window
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = shim
    try {
      await expect(pollPaseoDirectorySync(null, 'wt_1', '/work/orca')).resolves.toBeUndefined()
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
    expect(shim.api.paseo.getStatus).not.toHaveBeenCalled()
  })
})
