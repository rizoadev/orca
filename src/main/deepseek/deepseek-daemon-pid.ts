/**
 * Daemon-child pid bookkeeping for the DeepSeek web manager.
 *
 * A dev-mode main-process restart or crash orphans the previously spawned
 * `dsh --profile web` child: it keeps the registered loopback port and the
 * shared DSH_HOME, so the next spawn either walks to a higher port (a second
 * daemon fighting over the session registry) or fails outright — the "DeepSeek
 * Harness failed to start" loop. The manager records each spawned child's pid
 * here; the next spawn reaps the recorded process (Linux only, verified
 * against /proc) before binding.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
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

/** Best-effort check that a pid is really our dsh host (Linux /proc only). */
function pidIsDshHost(pid: number, dshBin: string): boolean {
  if (process.platform !== 'linux') {
    return false
  }
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    return cmdline.includes('--profile') || cmdline.includes(dshBin)
  } catch {
    return false
  }
}

/**
 * Kill any dsh host orphans on this machine — both the recorded daemon child
 * (if any) and any pid-fileless survivors from older code that share the
 * loopback port + DSH_HOME. Mirrors Paseo's reapOrphanPaseo /proc sweep.
 */
export async function reapOrphanDaemon(dataDir: string): Promise<void> {
  let recordedPid: number | null = null
  try {
    const pidFile = pidFilePath(dataDir)
    if (existsSync(pidFile)) {
      const recorded = JSON.parse(readFileSync(pidFile, 'utf8')) as {
        pid: number
        dshBin: string
      }
      if (
        Number.isFinite(recorded.pid) &&
        isPidAlive(recorded.pid) &&
        pidIsDshHost(recorded.pid, recorded.dshBin ?? '')
      ) {
        recordedPid = recorded.pid
        process.kill(recorded.pid, 'SIGTERM')
      }
    }
  } catch {
    // Best-effort — a stale/corrupt pid file must not block spawning.
  }
  // Why: orphans from older code (before pid recording) or surviving workers
  // share the registry port + DSH_HOME; sweep /proc so the fresh spawn
  // rebinds the same port instead of walking up and running a second daemon.
  if (process.platform === 'linux') {
    try {
      for (const entry of readdirSync('/proc')) {
        if (!/^\d+$/.test(entry)) {
          continue
        }
        const pid = Number.parseInt(entry, 10)
        if (pid === recordedPid || !pidIsDshHost(pid, '')) {
          continue
        }
        try {
          process.kill(pid, 'SIGTERM')
        } catch {
          // Already gone.
        }
      }
    } catch {
      // /proc unavailable — the recorded-pid kill above still frees the port.
    }
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
