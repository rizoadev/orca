/**
 * Manages OpenChamber web servers, one per project (worktree).
 *
 * Each project gets its own server child pinned to a DETERMINISTIC loopback
 * port derived from the project path. A per-project origin isolates the SPA's
 * localStorage (its `lastDirectory` pin) so switching worktrees can never boot
 * the UI into another project, a crash can restart on the same port, and
 * several projects can be worked on side by side. Servers spawn lazily, are
 * reaped via a per-project pid file when a previous run died without cleanup,
 * and stop on Orca quit.
 *
 * Shape mirrors `DeepSeekWebManager`: a loopback web host owned by Orca, with
 * the difference that OpenChamber additionally requires an OpenCode binary
 * (the agent engine it manages behind its UI). The manager resolves that
 * binary and hands it to the server via OPENCODE_BINARY.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type {
  OpenChamberProjectStatus,
  OpenChamberSessionSummary,
  OpenChamberWebState,
  OpenChamberWebStatus
} from '../../shared/openchamber-web-types'
import {
  clearServerPid,
  projectKey,
  reapOrphanServer,
  recordServerPid
} from './openchamber-server-pid'
import {
  fetchBusyDirectoriesOnPorts,
  fetchSessionCount,
  fetchSessionSummaries,
  projectWebStatus
} from './openchamber-server-api'
import { clearProjectStorage as clearOriginStorage } from './openchamber-server-storage'
import {
  resolveNodeBin,
  resolveOpenChamberServerEntrypoint,
  resolveOpencodeBin
} from './openchamber-server-resolver'
import { resolveFreeLoopbackPort, waitForHttpListener } from '../web-hosts/loopback-listener'

// Why: a stable base plus a per-project offset keeps ports predictable (and
// restart-reusable) while leaving room for many projects without colliding.
const PREFERRED_PORT = 3210
const PORT_RANGE = 256

type OpenChamberInstance = {
  projectPath: string
  key: string
  child: ChildProcess | null
  state: OpenChamberWebState
  error: string | null
  /** Resolved port — the deterministic one, or the next free on collision. */
  port: number
  cwd: string | null
  opencodeBinary: string | null
  stderrTail: string
}

export type { OpenChamberProjectStatus, OpenChamberWebState, OpenChamberWebStatus }

export type OpenChamberWebManagerOptions = {
  /** Enumerate every known Orca worktree path (for the auto-scan overview). */
  listWorktreePaths?: () => string[]
}

export class OpenChamberWebManager {
  private instances = new Map<string, OpenChamberInstance>()
  private activePath: string | null = null
  private readonly listWorktreePaths: () => string[]

  constructor(options: OpenChamberWebManagerOptions = {}) {
    this.listWorktreePaths = options.listWorktreePaths ?? (() => [])
  }

  private dataDir(): string {
    return join(app.getPath('userData'), 'openchamber', 'orca')
  }

  private instanceFor(projectPath: string): OpenChamberInstance {
    const existing = this.instances.get(projectPath)
    if (existing) {
      return existing
    }
    const key = projectKey(projectPath)
    const instance: OpenChamberInstance = {
      projectPath,
      key,
      child: null,
      state: 'stopped',
      error: null,
      port: PREFERRED_PORT + (Number.parseInt(key, 36) % PORT_RANGE),
      cwd: null,
      opencodeBinary: null,
      stderrTail: ''
    }
    this.instances.set(projectPath, instance)
    return instance
  }

  private activeInstance(): OpenChamberInstance | null {
    return this.activePath ? (this.instances.get(this.activePath) ?? null) : null
  }

  private instanceUrl(instance: OpenChamberInstance): string {
    return `http://127.0.0.1:${instance.port}`
  }

  private isChildAlive(instance: OpenChamberInstance): boolean {
    return (
      instance.child !== null &&
      instance.child.exitCode === null &&
      instance.child.signalCode === null
    )
  }

  private isRunning(instance: OpenChamberInstance): boolean {
    return instance.state === 'running' && this.isChildAlive(instance)
  }

  getStatus(): OpenChamberWebStatus {
    const instance = this.activeInstance()
    return projectWebStatus(instance, instance ? this.instanceUrl(instance) : null, PREFERRED_PORT)
  }

  async listSessions(): Promise<OpenChamberSessionSummary[]> {
    const instance = this.activeInstance()
    if (!instance || !this.isRunning(instance)) {
      return []
    }
    return fetchSessionSummaries(this.instanceUrl(instance), instance.cwd ?? '')
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
  async listProjects(): Promise<OpenChamberProjectStatus[]> {
    this.pruneOrphanedInstances()
    const seen = new Set<string>()
    const rows: OpenChamberProjectStatus[] = []
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
  async start(projectPath: string | null): Promise<OpenChamberWebStatus> {
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

    const entrypoint = resolveOpenChamberServerEntrypoint()
    if (!entrypoint) {
      instance.state = 'errored'
      instance.error =
        'OpenChamber server not found. Install @openchamber/web globally or set OPENCHAMBER_REPO_DIR to the openchamber checkout.'
      return this.getStatus()
    }
    const serverRoot = dirname(entrypoint)
    const opencodeBin = resolveOpencodeBin()
    if (!opencodeBin) {
      instance.state = 'errored'
      instance.error =
        'opencode CLI not found in PATH. Install it with: bun add -g @opencode-ai/cli (or set OPENCODE_BIN), then retry.'
      return this.getStatus()
    }
    instance.opencodeBinary = opencodeBin
    // Why: pin the server to the project's port — the deterministic one, or
    // the previously resolved port on a restart, so a crash reuses the same
    // URL and the tab does not need re-pointing.
    instance.port = await resolveFreeLoopbackPort(instance.port)
    instance.state = 'starting'
    instance.error = null
    instance.stderrTail = ''

    // Why: isolate OpenChamber's data dir so Orca-managed sessions, drafts and
    // config stay scoped to Orca instead of the user's real ~/.config/openchamber.
    const dataDir = this.dataDir()

    const child = spawn(
      resolveNodeBin(),
      [entrypoint, '--port', String(instance.port), '--host', '127.0.0.1'],
      {
        // Why: spawn from the server package dir so its deps resolve; the data
        // dir is isolated and the project attached via API, so a project .env
        // at the worktree can never take the server down.
        cwd: serverRoot,
        env: {
          ...process.env,
          OPENCHAMBER_DATA_DIR: dataDir,
          OPENCHAMBER_HOST: '127.0.0.1',
          OPENCODE_BINARY: opencodeBin,
          OPENCHAMBER_RUNTIME: 'web'
        },
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
    recordServerPid(dataDir, instance.key, child.pid ?? 0, entrypoint)
    child.once('exit', (code) => {
      if (instance.child === child) {
        instance.state = 'stopped'
        if (code !== 0) {
          instance.state = 'errored'
          instance.error = `OpenChamber server exited with code ${code}${instance.stderrTail ? `: ${instance.stderrTail.trim().split('\n').slice(-4).join(' | ')}` : ''}`
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
    await waitForHttpListener({
      url: this.instanceUrl(instance),
      timeoutMs: 45_000,
      isChildAlive: () => this.isChildAlive(instance)
    })
    if (!this.isChildAlive(instance)) {
      return this.getStatus()
    }
    // Why: a live child past the wait counts as up even if probes never
    // answered (listener may reject the probe path); the webview retries.
    instance.state = 'running'
    // Why: point the server's opencode directory at the project once the
    // listener is up, matching how DeepSeek registers the worktree.
    await this.attachInstanceDirectory(instance)
    return this.getStatus()
  }

  /** POST the project path to the server's directory endpoint (commit on ok). */
  private async attachInstanceDirectory(instance: OpenChamberInstance): Promise<void> {
    try {
      const res = await fetch(`${this.instanceUrl(instance)}/api/opencode/directory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: instance.projectPath, create: false }),
        signal: AbortSignal.timeout(10_000)
      })
      // Why: only commit cwd on success; a failed attach must not pretend the
      // server is scoped to a directory it could not activate.
      if (res.ok) {
        instance.cwd = instance.projectPath
      }
    } catch {
      // Best-effort — the webview session list drives the project selection.
    }
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
    await clearOriginStorage(this.instanceUrl(instance))
  }

  /** Stop every project server (Orca quit / explicit stop). */
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
