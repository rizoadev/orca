/**
 * Daemon-child pid bookkeeping for the DeepSeek web manager.
 *
 * A dev-mode main-process restart or crash orphans the previously spawned
 * `dsh --profile web` child: it keeps the registered loopback port and the
 * shared DSH_HOME, so the next spawn either walks to a higher port (a second
 * daemon fighting over the session registry) or fails outright — the "DeepSeek
 * Harness failed to start" loop. The manager records each spawned child's pid
 * here; the next spawn reaps the recorded process before binding.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function pidFilePath(dataDir: string): string {
  return join(dataDir, 'daemon.pid')
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Best-effort check that `pid` is really our dsh host.
 *
 * Only matches when `dshBin` is a non-empty binary path that appears in the
 * process cmdline. This blocks the empty-search-term trap where
 * `''.includes('')` is true for every process on the system — the bug that
 * previously let a cleanup sweep SIGTERM the whole machine. Never called as
 * part of a /proc enumeration.
 */
function pidIsDshHost(pid: number, dshBin: string): boolean {
  if (process.platform !== 'linux' || dshBin.trim() === '') {
    return false
  }
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    return cmdline.includes(dshBin)
  } catch {
    return false
  }
}

/**
 * Reap the previously spawned `dsh --profile web` child recorded for this data
 * dir, so a dev-mode restart or crash doesn't leave a daemon holding the
 * loopback port + DSH_HOME (the "DeepSeek Harness failed to start" loop).
 *
 * SAFETY: this only ever signals the single recorded child pid, and only after
 * verifying that pid is still our dsh host via its recorded binary path. It
 * never scans /proc or signals any other process.
 */
export async function reapOrphanDaemon(dataDir: string): Promise<void> {
  try {
    const pidFile = pidFilePath(dataDir)
    if (existsSync(pidFile)) {
      const recorded = JSON.parse(readFileSync(pidFile, 'utf8')) as {
        pid: number
        dshBin: string
      }
      if (
        Number.isFinite(recorded.pid) &&
        recorded.dshBin &&
        isPidAlive(recorded.pid) &&
        pidIsDshHost(recorded.pid, recorded.dshBin)
      ) {
        process.kill(recorded.pid, 'SIGTERM')
      }
    }
  } catch {
    // Best-effort — a stale/corrupt pid file must not block spawning.
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
  try {
    unlinkSync(pidFilePath(dataDir))
  } catch {
    // Already gone.
  }
}

/** Record a spawned child so the next spawn can reap it after a crash/restart. */
export function recordDaemonPid(dataDir: string, pid: number, dshBin: string): void {
  try {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(pidFilePath(dataDir), JSON.stringify({ pid, dshBin }))
  } catch {
    // Best-effort — pid recording is a cleanup aid, not a requirement.
  }
}

/** Drop the record on a clean stop so a recycled pid is never misidentified. */
export function clearDaemonPid(dataDir: string): void {
  try {
    const pidFile = pidFilePath(dataDir)
    if (existsSync(pidFile)) {
      unlinkSync(pidFile)
    }
  } catch {
    // Best-effort.
  }
}
