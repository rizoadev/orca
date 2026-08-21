/**
 * Persistent per-project loopback ports for DeepSeek Harness hosts.
 *
 * Ports are allocated on first use (lowest free at or above the base), written
 * to a JSON file under userData, and reused across restarts so a project keeps
 * the same URL forever. A removed project's port is released on prune.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { PREFERRED_PORT } from './deepseek-port-range'

export class DeepSeekPortRegistry {
  private ports = new Map<string, number>()

  constructor(private readonly filePath: string) {
    this.load()
  }

  /** The project's port, allocating the lowest free one on first use. */
  portFor(projectPath: string): number {
    const existing = this.ports.get(projectPath)
    if (existing !== undefined) {
      return existing
    }
    const used = new Set(this.ports.values())
    let candidate = PREFERRED_PORT
    while (used.has(candidate)) {
      candidate += 1
    }
    this.ports.set(projectPath, candidate)
    this.save()
    return candidate
  }

  /** Release a project's port so it can be reused (worktree removed). */
  drop(projectPath: string): void {
    if (this.ports.delete(projectPath)) {
      this.save()
    }
  }

  /** Persist a port a project actually bound (collision walk-up). */
  reassign(projectPath: string, port: number): void {
    if (this.ports.get(projectPath) === port) {
      return
    }
    this.ports.set(projectPath, port)
    this.save()
  }

  private load(): void {
    try {
      const doc = JSON.parse(readFileSync(this.filePath, 'utf8')) as Record<string, unknown>
      for (const [path, port] of Object.entries(doc)) {
        if (typeof port === 'number') {
          this.ports.set(path, port)
        }
      }
    } catch {
      // No registry yet — first run allocates on demand.
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(this.filePath, JSON.stringify(Object.fromEntries(this.ports), null, 2))
    } catch {
      // Best-effort — an unwritable registry must not block spawning.
    }
  }
}
