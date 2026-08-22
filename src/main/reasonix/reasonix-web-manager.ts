/**
 * Manages Reasonix web servers, one per project (worktree).
 *
 * Each project gets its own `reasonix serve` child pinned to a DETERMINISTIC
 * loopback port derived from the project path. A per-project origin isolates
 * the SPA's localStorage so switching worktrees can never boot the UI into
 * another project, a crash can restart on the same port, and several projects
 * can be worked on side by side. Servers spawn lazily, are reaped via a
 * per-project pid file when a previous run died without cleanup, and stop on
 * Orca quit.
 *
 * Shape mirrors `OpenChamberWebManager`: a loopback web host owned by Orca.
 * Unlike OpenChamber, Reasonix is a single Go binary (`reasonix serve`) that
 * IS the agent engine, so no separate agent-engine binary is resolved.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app, session } from 'electron'
import {
  REASONIX_WEBVIEW_PARTITION,
  type ReasonixProjectStatus,
  type ReasonixSessionSummary,
  type ReasonixWebState,
  type ReasonixWebStatus
} from '../../shared/reasonix-web-types'
import {
  clearServerPid,
  projectKey,
  reapOrphanServer,
  recordServerPid
} from './reasonix-server-pid'
import {
  fetchBusyDirectoriesOnPorts,
  fetchSessionCount,
  fetchSessionSummaries,
  projectWebStatus
} from './reasonix-server-api'
import { resolveFreeLoopbackPort, waitForHttpListener } from '../web-hosts/loopback-listener'
import { resolveReasonixBinary } from './reasonix-server-resolver'

// Why: a stable base plus a per-project offset keeps ports predictable (and
// restart-reusable) while leaving room for many projects without colliding.
const PREFERRED_PORT = 3500
const PORT_RANGE = 256

type ReasonixInstance = {
  projectPath: string
  key: string
  child: ChildProcess | null
  state: ReasonixWebState
  error: string | null
  /** Resolved port — the deterministic one, or the next free on collision. */
  port: number
  cwd: string | null
  binary: string | null
  stderrTail: string
}

export type { ReasonixProjectStatus, ReasonixSessionSummary, ReasonixWebState, ReasonixWebStatus }

export type ReasonixWebManagerOptions = {
  /** Enumerate every known Orca worktree path (for the auto-scan overview). */
  listWorktreePaths?: () => string[]
}

export class ReasonixWebManager {
  private instances = new Map<string, ReasonixInstance>()
  private activePath: string | null = null
  private readonly listWorktreePaths: () => string[]

  constructor(options: ReasonixWebManagerOptions = {}) {
    this.listWorktreePaths = options.listWorktreePaths ?? (() => [])
  }

  private dataDir(): string {
    return join(app.getPath('userData'), 'reasonix', 'orca')
  }

  private instanceFor(projectPath: string): ReasonixInstance {
    const existing = this.instances.get(projectPath)
    if (existing) {
      return existing
    }
    const key = projectKey(projectPath)
    const instance: ReasonixInstance = {
      projectPath,
      key,
      child: null,
      state: 'stopped',
      error: null,
      port: PREFERRED_PORT + (Number.parseInt(key, 36) % PORT_RANGE),
      cwd: null,
      binary: null,
      stderrTail: ''
    }
    this.instances.set(projectPath, instance)
    return instance
  }

  private activeInstance(): ReasonixInstance | null {
    return this.activePath ? (this.instances.get(this.activePath) ?? null) : null
  }

  private instanceUrl(instance: ReasonixInstance): string {
    return `http://127.0.0.1:${instance.port}`
  }

  private isChildAlive(instance: ReasonixInstance): boolean {
    return (
      instance.child !== null &&
      instance.child.exitCode === null &&
      instance.child.signalCode === null
    )
  }

  private isRunning(instance: ReasonixInstance): boolean {
    return instance.state === 'running' && this.isChildAlive(instance)
  }

  getStatus(): ReasonixWebStatus {
    const instance = this.activeInstance()
    return projectWebStatus(instance, instance ? this.instanceUrl(instance) : null, PREFERRED_PORT)
  }

  async listSessions(): Promise<ReasonixSessionSummary[]> {
    const instance = this.activeInstance()
    if (!instance || !this.isRunning(instance)) {
      return []
    }
    return fetchSessionSummaries(this.instanceUrl(instance))
  }

  /**
   * Directories from `directories` with a busy (non-idle) LLM turn on any
   * running server. Why every known port counts, tracked or not: servers
   * inherited from a previous main process keep serving open tabs but have no
   * live child here, so each directory's deterministic port is probed too.
   */
  listBusyDirectories(directories: string[]): Promise<string[]> {
    const ports = new Set(this.instances.values().map((instance) => instance.port))
    for (const directory of directories) {
      ports.add(PREFERRED_PORT + (Number.parseInt(projectKey(directory), 36) % PORT_RANGE))
    }
    return fetchBusyDirectoriesOnPorts([...ports], directories)
  }

  /**
   * Drop instances whose project directory no longer exists (removed worktree)
   * and whose server is stopped; live servers stay so they can be killed.
   */
  private pruneOrphanedInstances(): void {
    const worktreePaths = new Set(this.listWorktreePaths())
    for (const [path, instance] of this.instances) {
      const running = instance.child && instance.child.exitCode === null
      if (running || worktreePaths.has(path) || existsSync(path)) {
        continue
      }
      this.instances.delete(path)
      if (this.activePath === path) {
        this.activePath = null
      }
    }
  }

  /**
   * Every known Orca worktree plus every spawned server instance, each with
   * its (deterministic) port and live state — feeds the in-app overview table.
   * Orphaned instances (path no longer on disk) whose server is stopped are
   * pruned automatically so a removed worktree does not linger in the table
   * forever; live ones stay so the user can kill them and clean up.
   */
  async listProjects(): Promise<ReasonixProjectStatus[]> {
    this.pruneOrphanedInstances()
    const seen = new Set<string>()
    const rows: ReasonixProjectStatus[] = []
    const emit = (projectPath: string): void => {
      if (seen.has(projectPath)) {
        return
      }
      seen.add(projectPath)
      const instance = this.instances.get(projectPath)
      rows.push({
        projectPath,
        port:
          instance?.port ??
          PREFERRED_PORT + (Number.parseInt(projectKey(projectPath), 36) % PORT_RANGE),
        state: instance?.state ?? 'stopped',
        pid: instance?.child?.pid ?? null,
        sessionCount: 0,
        error: instance?.error ?? null
      })
    }
    for (const path of this.listWorktreePaths()) {
      emit(path)
    }
    // Why: servers for projects no longer in Orca (deleted/removed) still
    // surface so the user can kill or clear them; stopped orphans were pruned
    // above so they do not linger.
    for (const path of this.instances.keys()) {
      emit(path)
    }
    await Promise.all(
      rows.map(async (row) => {
        const instance = this.instances.get(row.projectPath)
        if (instance && this.isRunning(instance)) {
          row.sessionCount = await fetchSessionCount(this.instanceUrl(instance))
        }
      })
    )
    return rows
  }

  /**
   * Point the active project's server at that project. Because servers are
   * project-scoped, this is effectively "ensure the server for this directory
   * is running and make it the active one".
   */
  async attachDirectory(directory: string | null): Promise<void> {
    if (!directory) {
      return
    }
    await this.start(directory)
  }

  /**
   * Ensure the server for a project is running (spawning lazily) and make it
   * the active one. A live server is reused; a crashed one is reaped via its
   * pid file and restarted on the SAME resolved port.
   */
  async start(projectPath: string | null): Promise<ReasonixWebStatus> {
    if (!projectPath) {
      return this.getStatus()
    }
    const instance = this.instanceFor(projectPath)
    this.activePath = projectPath
    if (this.isRunning(instance)) {
      return this.getStatus()
    }
    // Why: reap a previous run's child for THIS project before binding, so a
    // dev-mode main restart or a crash cannot leak a zombie on its port.
    await reapOrphanServer(this.dataDir(), instance.key)

    const binary = resolveReasonixBinary()
    if (!binary) {
      instance.state = 'errored'
      instance.error =
        'reasonix binary not found. Install Reasonix (or set REASONIX_BINARY to the binary path), then retry.'
      return this.getStatus()
    }
    instance.binary = binary
    // Why: pin the server to the project's port — the deterministic one, or
    // the previously resolved port on a restart, so a crash reuses the same
    // URL and the tab does not need re-pointing.
    instance.port = await resolveFreeLoopbackPort(instance.port)
    instance.state = 'starting'
    instance.error = null
    instance.stderrTail = ''

    // Why: Orca owns the pid-file dir so a previous run can be reaped, but we
    // deliberately do NOT override REASONIX_HOME — Reasonix then uses the
    // user's real config (provider key, sessions) instead of an empty one.
    const dataDir = this.dataDir()

    const child = spawn(
      binary,
      // Why: `serve` has no --dir flag (that's chat/run only); it serves from the
      // process CWD, which we pin to the worktree via spawn `cwd`.
      ['serve', '--addr', `127.0.0.1:${instance.port}`, '--auth', 'none', '--no-open'],
      {
        cwd: projectPath,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      }
    )
    child.stderr?.on('data', (chunk: Buffer) => {
      instance.stderrTail = (instance.stderrTail + chunk.toString()).slice(-2_000)
    })
    instance.child = child
    // Why: record the child so the next spawn can reap it if this main process
    // dies without running stop() (dev-mode restarts, crashes).
    recordServerPid(dataDir, instance.key, child.pid ?? 0)
    child.once('exit', (code) => {
      if (instance.child === child) {
        instance.state = 'stopped'
        if (code !== 0) {
          instance.state = 'errored'
          instance.error = `Reasonix server exited with code ${code}${instance.stderrTail ? `: ${instance.stderrTail.trim().split('\n').slice(-4).join(' | ')}` : ''}`
        }
      }
    })
    child.once('error', (err) => {
      if (instance.child === child) {
        instance.state = 'errored'
        instance.error = err.message
      }
    })

    // Why: wait for the HTTP listener so the webview load doesn't race the server.
    const listenerUp = await waitForHttpListener({
      url: this.instanceUrl(instance),
      timeoutMs: 45_000,
      isChildAlive: () => this.isChildAlive(instance)
    })
    if (!listenerUp) {
      // Why: a child that never bound its listener (bad flag, missing binary,
      // config error) must surface a clear error instead of a silent
      // 'starting'/'running' state with a dead URL behind it.
      if (instance.state === 'starting' || instance.state === 'running') {
        instance.state = 'errored'
        const tail = instance.stderrTail.trim()
        instance.error = tail
          ? `Reasonix did not start listening on ${this.instanceUrl(instance)}:\n${tail.split('\n').slice(-10).join('\n')}`
          : `Reasonix did not start listening on ${this.instanceUrl(instance)} within 45s. Ensure the 'reasonix' binary is installed (or set REASONIX_BINARY) and a provider/API key is configured.`
      }
      return this.getStatus()
    }
    if (!this.isChildAlive(instance)) {
      return this.getStatus()
    }
    // Why: the listener answered, so the server is up; the webview loads it.
    instance.state = 'running'
    instance.cwd = projectPath
    return this.getStatus()
  }

  /** Stop one project's server (frees its port for the next spawn). */
  stopProject(projectPath: string): void {
    const instance = this.instances.get(projectPath)
    if (!instance) {
      return
    }
    const child = instance.child
    instance.child = null
    if (child && child.exitCode === null) {
      child.kill()
    }
    clearServerPid(this.dataDir(), instance.key)
    instance.state = 'stopped'
    instance.error = null
    instance.cwd = null
    if (this.activePath === projectPath) {
      this.activePath = null
    }
  }

  /** Wipe a project's SPA storage (localStorage + cookies) for its origin. */
  async clearProjectStorage(projectPath: string): Promise<void> {
    const instance = this.instances.get(projectPath)
    if (!instance) {
      return
    }
    await session.fromPartition(REASONIX_WEBVIEW_PARTITION).clearStorageData({
      origin: this.instanceUrl(instance),
      storages: ['localstorage', 'cookies']
    })
  }

  /** Stop the active project server (Orca quit / explicit stop). */
  stop(): void {
    const dataDir = this.dataDir()
    for (const instance of this.instances.values()) {
      const child = instance.child
      instance.child = null
      if (child && child.exitCode === null) {
        child.kill()
      }
      // Why: drop the reap record so a long-idle stale pid is never
      // misidentified after the OS recycled the number.
      clearServerPid(dataDir, instance.key)
      instance.state = 'stopped'
      instance.cwd = null
    }
    this.activePath = null
  }
}
