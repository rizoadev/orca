import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { clearDaemonPid, reapOrphanDaemon, recordDaemonPid } from './deepseek-daemon-pid'

const tmpDirs: string[] = []

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-ds-pid-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('deepseek daemon pid bookkeeping', () => {
  it('records and clears the daemon pid file', () => {
    const dir = freshDir()
    recordDaemonPid(dir, 4321, '/usr/bin/dsh')
    const file = join(dir, 'daemon.pid')
    expect(existsSync(file)).toBe(true)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ pid: 4321, dshBin: '/usr/bin/dsh' })
    clearDaemonPid(dir)
    expect(existsSync(file)).toBe(false)
    // Clearing twice must stay quiet.
    expect(() => clearDaemonPid(dir)).not.toThrow()
  })

  it('reap is a no-op without a pid file or with a dead/unrelated pid', async () => {
    const empty = freshDir()
    await expect(reapOrphanDaemon(empty)).resolves.toBeUndefined()

    const dir = freshDir()
    writeFileSync(join(dir, 'daemon.pid'), JSON.stringify({ pid: 999_999_999, dshBin: '/dsh' }))
    await expect(reapOrphanDaemon(dir)).resolves.toBeUndefined()
  })

  it('reap survives a corrupt pid file', async () => {
    const dir = freshDir()
    writeFileSync(join(dir, 'daemon.pid'), 'not json{')
    await expect(reapOrphanDaemon(dir)).resolves.toBeUndefined()
  })
})
