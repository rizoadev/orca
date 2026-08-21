/**
 * Unit tests for PaseoAutoAttach: path normalization, per-path dedupe and the
 * idempotent open_project attach flow, exercised against a fake WebSocket.
 * The fake auto-configures on construction (greets with server_info and
 * answers open_project_request) so every instance doAttach creates behaves.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
  type Handler = (data?: unknown) => void
  const instances: FakeWebSocket[] = []
  class FakeWebSocket {
    sent: string[] = []
    private listeners = new Map<string, Handler[]>()
    constructor() {
      instances.push(this)
      // Why: greet after the current tick so doAttach's message handler is
      // registered first (the real daemon greets after hello).
      setTimeout(() => {
        this.emit(
          'message',
          JSON.stringify({
            type: 'session',
            message: { type: 'status', payload: { status: 'server_info', serverId: 'srv_test' } }
          })
        )
      }, 0)
    }
    send(data: string): void {
      this.sent.push(data)
      const parsed = JSON.parse(data)
      const message = parsed.message as { type?: string; requestId?: string }
      if (message?.type === 'open_project_request') {
        setTimeout(() => {
          this.emit(
            'message',
            JSON.stringify({
              type: 'session',
              message: {
                type: 'open_project_response',
                payload: {
                  requestId: message.requestId,
                  workspace: { id: 'wks_test' },
                  error: null
                }
              }
            })
          )
        }, 0)
      }
    }
    close(): void {
      /* noop */
    }
    on(event: string, handler: Handler): void {
      const list = this.listeners.get(event) ?? []
      list.push(handler)
      this.listeners.set(event, list)
    }
    once(event: string, handler: Handler): void {
      this.on(event, handler)
    }
    emit(event: string, data?: unknown): void {
      for (const handler of this.listeners.get(event) ?? []) {
        handler(data)
      }
    }
  }
  return { FakeWebSocket, instances }
})

vi.mock('ws', () => ({ default: harness.FakeWebSocket }))

import { PaseoAutoAttach } from './auto-attach'
import type { PaseoDaemonManager } from './daemon-manager'

const fakeDaemon = (running = true): Pick<PaseoDaemonManager, 'isRunning' | 'getStatus'> => ({
  isRunning: () => running,
  getStatus: () => ({
    state: running ? 'running' : 'stopped',
    port: 6768,
    url: null,
    pid: null,
    error: null
  })
})

// Why: ATTACH_DELAY_MS (300) gates the request send; a real short wait is
// simpler and more faithful than faking timers across the WS handshake.
const SETTLE_MS = 600

beforeEach(() => {
  harness.instances.length = 0
})

describe('PaseoAutoAttach.attachWorktree', () => {
  it('normalizes a folder-workspace-instance path before sending', async () => {
    const attach = new PaseoAutoAttach(fakeDaemon() as unknown as PaseoDaemonManager)
    const result = await attach.attachWorktree(
      '/home/x/repo::workspace:00000000-0000-4000-8000-000000000000'
    )
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
    expect(result).toEqual({ workspaceId: 'wks_test', serverId: 'srv_test' })
    const openProject = harness.instances[0].sent
      .map((s) => JSON.parse(s))
      .find((m) => (m.message as { type?: string })?.type === 'open_project_request')
    expect(openProject.message.cwd).toBe('/home/x/repo')
  })

  it('sends exactly one open_project_request for concurrent same-path attaches', async () => {
    const attach = new PaseoAutoAttach(fakeDaemon() as unknown as PaseoDaemonManager)
    const [first, second] = await Promise.all([
      attach.attachWorktree('/home/x/repo'),
      attach.attachWorktree('/home/x/repo')
    ])
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
    expect(first.workspaceId).toBe('wks_test')
    expect(second.workspaceId).toBe('wks_test')
    // Why: the second caller must share the first's in-flight promise instead
    // of opening a second WS (which would race the daemon's find-or-create).
    expect(harness.instances.length).toBe(1)
  })

  it('serves later attaches for the same path from the result cache', async () => {
    const attach = new PaseoAutoAttach(fakeDaemon() as unknown as PaseoDaemonManager)
    await attach.attachWorktree('/home/x/repo')
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
    const again = await attach.attachWorktree('/home/x/repo')
    expect(again.workspaceId).toBe('wks_test')
    expect(harness.instances.length).toBe(1)
  })
})

describe('PaseoAutoAttach.attachAllWorktrees', () => {
  it('dedupes duplicate paths and normalizes folder-instance suffixes', async () => {
    const attach = new PaseoAutoAttach(fakeDaemon() as unknown as PaseoDaemonManager)
    const rows = await attach.attachAllWorktrees([
      '/home/x/a',
      '/home/x/a',
      '/home/x/b::workspace:00000000-0000-4000-8000-000000000000',
      '/home/x/b'
    ])
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.projectPath)).toEqual(['/home/x/a', '/home/x/b'])
    expect(rows.every((r) => r.attached)).toBe(true)
  })
})
