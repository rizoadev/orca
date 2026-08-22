import { describe, expect, it, vi } from 'vitest'

import {
  forceRecoverDeepSeek,
  hideDeepSeekOtherWorkspaces,
  injectDeepSeekMatchOverlay,
  isDeepSeekWebviewUrl
} from './deepseek-webview-style'

// Why: tests exercise the guard contract, not the full Electron WebviewTag.
const executingWebview = (
  executeJavaScript: (script: string) => Promise<unknown>
): Electron.WebviewTag =>
  ({ getURL: () => 'http://127.0.0.1:3580/', executeJavaScript }) as unknown as Electron.WebviewTag

describe('isDeepSeekWebviewUrl', () => {
  it('accepts the loopback root', () => {
    expect(isDeepSeekWebviewUrl('http://127.0.0.1:3580/')).toBe(true)
  })

  it('rejects non-Harness hosts', () => {
    expect(isDeepSeekWebviewUrl('https://example.com/')).toBe(false)
    expect(isDeepSeekWebviewUrl('http://localhost:3580/')).toBe(false)
    expect(isDeepSeekWebviewUrl('http://127.0.0.1:3580/h/workspace/1')).toBe(false)
  })
})

describe('injectDeepSeekMatchOverlay', () => {
  it('skips non-DeepSeek URLs', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.resolve(undefined))
    const guest = {
      getURL: () => 'https://example.com',
      executeJavaScript
    } as unknown as Electron.WebviewTag
    injectDeepSeekMatchOverlay(guest, guest.getURL(), '/work/orca')
    expect(executeJavaScript).not.toHaveBeenCalled()
  })

  it('injects an overlay script that resolves the session cwd and force-recovers on mismatch', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.resolve(undefined))
    injectDeepSeekMatchOverlay(
      executingWebview(executeJavaScript),
      'http://127.0.0.1:3580/',
      '/work/orca'
    )
    expect(executeJavaScript).toHaveBeenCalledTimes(1)
    const script = String(executeJavaScript.mock.calls[0][0])
    expect(script).toContain('/work/orca')
    expect(script).toContain('data-orca-ds-match')
    expect(script).toContain("localStorage.getItem('dsh.sessions.current')")
    // guest resolves the session id to a cwd via the host RPC envelope
    expect(script).toContain('/api/session.list')
    expect(script).toContain("method: 'session.list'")
    expect(script).toContain('setInterval')
    expect(script).toContain('force-recover')
    // retry timestamp throttle persists across reloads instead of a one-shot flag
    expect(script).toContain("sessionStorage.setItem('orcaDsLastForcedAt'")
    expect(script).toContain('orcaDsBootedAt')
    expect(script).toContain('orcaDsAutoReloaded')
    // mismatch blocks input and auto-reloads once before force-recover
    expect(script).toContain('data-orca-ds-blocker')
    expect(script).toContain('guard.blocked')
    expect(script).toContain('keydown')
    expect(script).toContain('input')
    expect(script).toContain('location.reload()')
    expect(script).toContain('autoReloaded')
    // bootedAt/autoReloaded persist in sessionStorage so a reload cannot reset
    // them and re-enter the auto-reload branch forever (blocker stuck)
    expect(script).toContain("sessionStorage.getItem('orcaDsBootedAt'")
    expect(script).toContain("sessionStorage.getItem('orcaDsAutoReloaded'")
  })

  it('swallows executeJavaScript rejections', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.reject(new Error('guest crashed')))
    expect(() =>
      injectDeepSeekMatchOverlay(
        executingWebview(executeJavaScript),
        'http://127.0.0.1:3580/',
        '/work/orca'
      )
    ).not.toThrow()
  })
})

describe('hideDeepSeekOtherWorkspaces', () => {
  it('skips non-DeepSeek URLs', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.resolve(undefined))
    const guest = {
      getURL: () => 'https://example.com',
      executeJavaScript
    } as unknown as Electron.WebviewTag
    hideDeepSeekOtherWorkspaces(guest, guest.getURL(), '/work/orca')
    expect(executeJavaScript).not.toHaveBeenCalled()
  })

  it('injects a workspace-tree filter script keyed on the worktree path', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.resolve(undefined))
    hideDeepSeekOtherWorkspaces(
      executingWebview(executeJavaScript),
      'http://127.0.0.1:3580/',
      '/home/user/projects/my-app'
    )
    expect(executeJavaScript).toHaveBeenCalledTimes(1)
    const script = String(executeJavaScript.mock.calls[0][0])
    // ├─ matches the current project by the selected-session row, falls back
    // │  to the worktree folder name, and watches for DOM churn
    expect(script).toContain('/home/user/projects/my-app')
    expect(script).toContain('aria-expanded')
    expect(script).toContain('aria-selected="true"')
    expect(script).toContain('MutationObserver')
    expect(script).toContain('my-app') // folder fallback
  })

  it('swallows executeJavaScript rejections', () => {
    const executeJavaScript = vi.fn((_script: string) => Promise.reject(new Error('guest crashed')))
    expect(() =>
      hideDeepSeekOtherWorkspaces(
        executingWebview(executeJavaScript),
        'http://127.0.0.1:3580/',
        '/work/orca'
      )
    ).not.toThrow()
  })
})

describe('forceRecoverDeepSeek', () => {
  it('stops, restarts against the worktree, re-pins the session and reloads', async () => {
    const calls: string[] = []
    const api = {
      stop: vi.fn(async () => {
        calls.push('stop')
        return { state: 'stopped', port: 0, url: null, cwd: null, error: null }
      }),
      start: vi.fn(async (cwd: string) => {
        calls.push(`start:${cwd}`)
        return { state: 'running', url: 'http://127.0.0.1:3580/', port: 3580, cwd }
      }),
      listSessions: vi.fn(async () => [
        { sessionId: 'ses_a', cwd: '/other/project' },
        { sessionId: 'ses_b', cwd: '/work/orca' }
      ])
    }
    const executeJavaScript = vi.fn(async () => undefined)
    const loadURL = vi.fn(async () => undefined)
    const webview = {
      getURL: () => 'http://127.0.0.1:3580/',
      executeJavaScript,
      loadURL
    } as unknown as Electron.WebviewTag
    const shim = { api: { deepseekWeb: api } } as unknown as Window
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = shim
    try {
      await forceRecoverDeepSeek(webview, '/work/orca')
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
    expect(calls).toEqual(['stop', 'start:/work/orca'])
    expect(executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining("localStorage.setItem('dsh.sessions.current'")
    )
    expect(executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('ses_b'))
    expect(loadURL).toHaveBeenCalledWith('http://127.0.0.1:3580/')
  })

  it('reloads when no matching session exists yet (SPA may create one)', async () => {
    const api = {
      stop: vi.fn(async () => undefined),
      start: vi.fn(async () => ({
        state: 'running',
        url: 'http://127.0.0.1:3580/',
        port: 3580,
        cwd: '/work/orca'
      })),
      listSessions: vi.fn(async () => [])
    }
    const executeJavaScript = vi.fn(async () => undefined)
    const loadURL = vi.fn(async () => undefined)
    const webview = {
      getURL: () => 'http://127.0.0.1:3580/',
      executeJavaScript,
      loadURL
    } as unknown as Electron.WebviewTag
    const shim = { api: { deepseekWeb: api } } as unknown as Window
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = shim
    try {
      await forceRecoverDeepSeek(webview, '/work/orca')
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
    expect(executeJavaScript).not.toHaveBeenCalled()
    expect(loadURL).toHaveBeenCalledWith('http://127.0.0.1:3580/')
  })

  it('falls back to reload when loadURL rejects', async () => {
    const api = {
      stop: vi.fn(async () => undefined),
      start: vi.fn(async () => ({ state: 'running', url: null, port: 3580, cwd: '' })),
      listSessions: vi.fn(async () => [])
    }
    const loadURL = vi.fn(async () => {
      throw new Error('nav failed')
    })
    const reload = vi.fn()
    const webview = {
      getURL: () => 'http://127.0.0.1:3580/',
      loadURL,
      reload
    } as unknown as Electron.WebviewTag
    const shim = { api: { deepseekWeb: api } } as unknown as Window
    const originalWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = shim
    try {
      await expect(forceRecoverDeepSeek(webview, '/work/orca')).resolves.toBeUndefined()
    } finally {
      ;(globalThis as { window?: unknown }).window = originalWindow
    }
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
