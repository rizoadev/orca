import { beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.fn()
vi.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args)
}))

import { buildInteractiveSshCommand } from './ssh-shell-session-service'
import type { SshTarget } from '../../shared/ssh-types'

function makeTarget(overrides: Partial<SshTarget> = {}): SshTarget {
  return {
    id: 't1',
    label: 'box',
    host: 'box.example.com',
    port: 22,
    username: 'root',
    ...overrides
  }
}

describe('buildInteractiveSshCommand', () => {
  it('does not pass -T so the remote allocates a TTY', () => {
    const { file, args } = buildInteractiveSshCommand(makeTarget(), '/usr/bin/ssh')
    expect(file).toBe('/usr/bin/ssh')
    expect(args).not.toContain('-T')
  })

  it('targets the config host alias when present', () => {
    const { args } = buildInteractiveSshCommand(
      makeTarget({ configHost: 'mybox', host: '1.2.3.4' }),
      'ssh'
    )
    const userHost = args.at(-1)!
    expect(userHost).toContain('root@mybox')
  })

  it('passes explicit port and identity for manual targets', () => {
    const { args } = buildInteractiveSshCommand(
      makeTarget({ port: 2222, identityFile: '/keys/id_ed25519' }),
      'ssh'
    )
    const portFlagAt = args.indexOf('-p')
    expect(portFlagAt).toBeGreaterThanOrEqual(0)
    expect(args[portFlagAt + 1]).toBe('2222')
    expect(args).toContain('-i')
    expect(args[args.indexOf('-i') + 1]).toBe('/keys/id_ed25519')
  })
})

describe('ssh shell session service lifecycle', () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  async function makeService() {
    const mod = await import('./ssh-shell-session-service')
    const service = mod.createSshShellSessionService({
      getTarget: (id) => (id === 't1' ? makeTarget() : undefined)
    })
    return { service }
  }

  function fakePty() {
    const dataCbs: ((chunk: string) => void)[] = []
    const exitCbs: ((e: { exitCode: number; signal?: string }) => void)[] = []
    return {
      pty: {
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(() => {
          exitCbs.forEach((cb) => cb({ exitCode: 0 }))
        }),
        onData: (cb: (chunk: string) => void) => {
          dataCbs.push(cb)
        },
        onExit: (cb: (e: { exitCode: number; signal?: string }) => void) => {
          exitCbs.push(cb)
        },
        pid: 123
      },
      emitData: (chunk: string) => dataCbs.forEach((cb) => cb(chunk)),
      emitExit: () => exitCbs.forEach((cb) => cb({ exitCode: 0 }))
    }
  }

  it('spawns ssh with clamped geometry and returns a session id', async () => {
    const fake = fakePty()
    spawnMock.mockReturnValue(fake.pty)
    const { service } = await makeService()

    const result = service.spawn({ targetId: 't1', cols: 99999, rows: 0 })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.shellSessionId).toMatch(/^rsh-/)
    const [, , options] = spawnMock.mock.calls[0]
    expect(options.cols).toBe(500)
    expect(options.rows).toBe(2)
  })

  it('rejects unknown targets without spawning', async () => {
    const { service } = await makeService()
    const result = service.spawn({ targetId: 'nope' })
    expect(result.ok).toBe(false)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('routes data and exit events only while the session exists', async () => {
    const fake = fakePty()
    spawnMock.mockReturnValue(fake.pty)
    const { service } = await makeService()

    const seenData: string[] = []
    service.onData((event) => seenData.push(event.chunkBase64))
    let exited = false
    service.onExit(() => {
      exited = true
    })

    const result = service.spawn({ targetId: 't1' })
    if (!result.ok) {
      throw new Error('spawn failed')
    }
    // Why: node-pty delivers UTF-8 strings; the service is the one that base64-encodes for IPC.
    fake.emitData('hello')
    expect(seenData).toEqual([btoa('hello')])

    fake.emitExit()
    expect(exited).toBe(true)

    // Why: post-exit writes must be no-ops, not resurrect state.
    expect(service.write(result.shellSessionId, 'x')).toBe(false)
  })

  it('disposeAll kills every live session', async () => {
    const fakeA = fakePty()
    const fakeB = fakePty()
    spawnMock.mockImplementationOnce(() => fakeA.pty).mockImplementationOnce(() => fakeB.pty)
    const { service } = await makeService()
    service.spawn({ targetId: 't1' })
    service.spawn({ targetId: 't1' })
    service.disposeAll()
    expect(fakeA.pty.kill).toHaveBeenCalled()
    expect(fakeB.pty.kill).toHaveBeenCalled()
    expect(service.listSessionIds()).toHaveLength(0)
  })
})
