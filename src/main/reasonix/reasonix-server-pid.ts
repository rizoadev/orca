/**
 * Server-child pid bookkeeping for the Reasonix manager.
 *
 * Dev-mode main-process restarts orphan the previously spawned server child
 * (the old main never runs its exit handler), so every restart leaks a zombie
 * and the next spawn takes a higher port. The manager records each spawned
 * child's pid here (keyed per project so a crashed server can be reaped and
 * its deterministic port rebound); the next spawn reaps the recorded process
 * (Linux only, verified against /proc).
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Stable per-project identity: a short hash of the project path, used both for
 * the pid-file name and (via the manager) the deterministic loopback port.
 */
export function projectKey(projectPath: string): string {
  let hash = 0
  for (const ch of projectPath) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  }
  return hash.toString(36)
}

function pidFilePath(dataDir: string, key: string): string {
  return join(dataDir, `server-${key}.pid`)
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Best-effort check that a pid is really our reasonix server (Linux /proc only). */
function pidIsReasonix(pid: number): boolean {
  if (process.platform !== 'linux') {
    return false
  }
  try {
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    return cmdline.toLowerCase().includes('reasonix')
  } catch {
    return false
  }
}

/**
 * Kill the previously recorded server child for a project, if any, and give
 * its socket a beat to release so its deterministic port can be rebound.
 * Never throws.
 */
export async function reapOrphanServer(dataDir: string, key: string): Promise<void> {
  try {
    const pidFile = pidFilePath(dataDir, key)
    if (!existsSync(pidFile)) {
      return
    }
    const recorded = JSON.parse(readFileSync(pidFile, 'utf8')) as { pid: number }
    if (isPidAlive(recorded.pid) && pidIsReasonix(recorded.pid)) {
      process.kill(recorded.pid, 'SIGTERM')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  } catch {
    // Best-effort — a stale/corrupt pid file must not block spawning.
  }
}

/** Record a spawned child so the next spawn can reap it after a crash/restart. */
export function recordServerPid(dataDir: string, key: string, pid: number): void {
  try {
    mkdirSync(dataDir, { recursive: true })
    writeFileSync(pidFilePath(dataDir, key), JSON.stringify({ pid }))
  } catch {
    // Best-effort — pid recording is a cleanup aid, not a requirement.
  }
}

/** Drop the record on a clean stop so a recycled pid is never misidentified. */
export function clearServerPid(dataDir: string, key: string): void {
  try {
    const pidFile = pidFilePath(dataDir, key)
    if (existsSync(pidFile)) {
      unlinkSync(pidFile)
    }
  } catch {
    // Best-effort.
  }
}
