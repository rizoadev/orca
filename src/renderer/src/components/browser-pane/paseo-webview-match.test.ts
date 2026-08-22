import { beforeEach, describe, expect, it, vi } from 'vitest'

// Why: the node test env has no Web Storage; reconcilePaseoServerId and the
// force-recover cooldown read localStorage/sessionStorage.
const storage = new Map<string, string>()
const fakeStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value)
  },
  removeItem: (key: string) => {
    storage.delete(key)
  },
  clear: () => storage.clear()
}
vi.stubGlobal('localStorage', fakeStorage)
vi.stubGlobal('sessionStorage', fakeStorage)

beforeEach(() => {
  storage.clear()
})

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
  pollPaseoDirectorySync,
  reconcilePaseoServerId,
  retryPaseoAttach
} from './paseo-webview-match'
import {
  isPaseoWebviewRootUrl,
  isPaseoWebviewUrl,
  hidePaseoOtherWorkspaces
} from './paseo-webview-style'

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

describe('hidePaseoOtherWorkspaces', () => {
  it('injects a group-wrapper filter that keeps only the open workspace project group', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.resolve(undefined))
    const webview = {
      getURL: () => 'http://127.0.0.1:6768/h/srv_1/workspace/wks_1',
      executeJavaScript
    } as unknown as Electron.WebviewTag
    hidePaseoOtherWorkspaces(webview, webview.getURL(), '/work/orca')
    expect(executeJavaScript).toHaveBeenCalledTimes(1)
    const script = String(executeJavaScript.mock.calls[0][0])
    // Why: the target resolves from the open route first (its group is the
    // rendered one), falling back to the Orca directory via the replica cache.
    expect(script).toContain('location.pathname.match')
    expect(script).toContain('paseo-replica-cache')
    // Why: groups are opacity/z-index wrappers holding a project name row;
    // hiding the wrapper removes name + workspace rows without gaps.
    expect(script).toContain('opacity: 1')
    expect(script).toContain('sidebar-project-row-')
    expect(script).toContain(`'[data-testid$=":' + targetId + '"]'`)
    // Why: an unmatched target must show everything instead of blanking.
    expect(script).toContain('matchedAny')
    expect(script).toContain('sidebar-add-project')
    expect(script).toContain('MutationObserver')
  })

  it('skips non-Paseo URLs', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.resolve(undefined))
    const webview = {
      getURL: () => 'https://example.com',
      executeJavaScript
    } as unknown as Electron.WebviewTag
    hidePaseoOtherWorkspaces(webview, webview.getURL(), '/work/orca')
    expect(executeJavaScript).not.toHaveBeenCalled()
  })
})

describe('isPaseoWebviewRootUrl', () => {
  it('accepts the daemon root and /open-project home', () => {
    expect(isPaseoWebviewRootUrl('http://127.0.0.1:6768/')).toBe(true)
    expect(isPaseoWebviewRootUrl('http://127.0.0.1:6768/open-project')).toBe(true)
    expect(isPaseoWebviewRootUrl('http://127.0.0.1:6768/open-project?x=1')).toBe(true)
  })

  it('rejects /h/ routes (those belong to isPaseoWebviewUrl) and other hosts', () => {
    expect(isPaseoWebviewRootUrl('http://127.0.0.1:6768/h/srv_1/workspace/wks_1')).toBe(false)
    expect(isPaseoWebviewRootUrl('https://app.paseo.sh/')).toBe(false)
  })
})

describe('reconcilePaseoServerId', () => {
  it('clears webview storage exactly once when the daemon serverId changes', async () => {
    const api = { clearWebviewStorage: vi.fn(async () => undefined) }
    const shim = { api: { paseo: api } } as unknown as Window
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = shim
    try {
      // first attach: records the id, no clear
      expect(await reconcilePaseoServerId('srv_old')).toBe(false)
      expect(api.clearWebviewStorage).not.toHaveBeenCalled()
      // same id again: no clear
      expect(await reconcilePaseoServerId('srv_old')).toBe(false)
      expect(api.clearWebviewStorage).not.toHaveBeenCalled()
      // daemon identity changed: clear once
      expect(await reconcilePaseoServerId('srv_new')).toBe(true)
      expect(api.clearWebviewStorage).toHaveBeenCalledTimes(1)
      // and the new id is now the baseline
      expect(await reconcilePaseoServerId('srv_new')).toBe(false)
      expect(api.clearWebviewStorage).toHaveBeenCalledTimes(1)
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
      localStorage.removeItem('orca:paseo-server-id')
    }
  })
})

describe('retryPaseoAttach', () => {
  it('returns the workspace once the daemon reports it (retrying transient misses)', async () => {
    let calls = 0
    const api = {
      attachProject: vi.fn(async () => {
        calls += 1
        return calls >= 3
          ? { ok: true, workspaceId: 'wks_9', serverId: 'srv_9' }
          : { ok: true, workspaceId: null, serverId: null }
      })
    }
    const shim = { api: { paseo: api } } as unknown as Window
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = shim
    try {
      const result = await retryPaseoAttach('/work/orca', () => false)
      expect(calls).toBe(3)
      expect(result).toEqual({ workspaceId: 'wks_9', serverId: 'srv_9' })
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })

  it('stops retrying when cancelled', async () => {
    const api = {
      attachProject: vi.fn(async () => ({ ok: true, workspaceId: null, serverId: null }))
    }
    const shim = { api: { paseo: api } } as unknown as Window
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = shim
    try {
      const result = await retryPaseoAttach('/work/orca', () => true)
      // Why: cancellation is checked before every attempt, so a torn-down
      // effect never opens a needless attach.
      expect(api.attachProject).not.toHaveBeenCalled()
      expect(result).toEqual({ workspaceId: null, serverId: null })
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
  })
})

describe('forceRecoverPaseo', () => {
  it('restarts the daemon, re-attaches the project, re-pins the selection and loads the workspace route', async () => {
    const calls: string[] = []
    const api = {
      clearWebviewStorage: vi.fn(async () => undefined),
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
      clearWebviewStorage: vi.fn(async () => undefined),
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
      api: {
        paseo: {
          getStatus: vi.fn(),
          start: vi.fn(),
          attachProject: vi.fn(),
          clearWebviewStorage: vi.fn()
        }
      }
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
