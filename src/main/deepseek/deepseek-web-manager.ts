/**
 * Manages a SINGLE DeepSeek Harness web daemon serving every Orca worktree.
 *
 * One `dsh --profile web` child on a PERSISTENT loopback port (allocated by a
 * registry, lowest free, written to disk under userData). Every worktree is
 * registered as a Host Workspace on that daemon, so switching projects never
 * restarts anything — the SPA just re-pins its current session to the session
 * whose cwd matches the active worktree.
 *
 * Why one daemon instead of one per project: multiple dsh children sharing
 * the same DSH_HOME fight over the workspace/session registry (sessions leak
 * across projects — the "wrong project" bug) and spawn-heavy children pile
 * up past the startup timeout (the "max 3 / failed to start" bug). A single
 * daemon sidesteps both, matching how Paseo runs one daemon for all projects.
 */
import type { ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { app } from 'electron'
import { DeepSeekHostClient } from './deepseek-host-client'
import {
  ensureEnglishHarnessLocale,
  setDefaultAgentPresetInSettings
} from './deepseek-harness-settings'
import { clearDaemonPid, reapOrphanDaemon, recordDaemonPid } from './deepseek-daemon-pid'
import { spawnDeepSeekHost } from './deepseek-host-spawn'
import { harnessHome, resolveDshBin } from './deepseek-server-resolver'
import { DeepSeekPortRegistry } from './deepseek-port-registry'
import { resolveFreeLoopbackPort, waitForHttpListener } from '../web-hosts/loopback-listener'
import type {
  DeepSeekAgentPreset,
  DeepSeekProjectStatus,
  DeepSeekSessionSummary,
  DeepSeekWebState,
  DeepSeekWebStatus
} from '../../shared/deepseek-web-types'

// Why: the registry keys by project path; the single daemon uses one fixed key
// so its port stays stable while every worktree shares the same host.
const DAEMON_KEY = 'daemon'

type DeepSeekInstance = {
  projectPath: string
  child: ChildProcess | null
  state: DeepSeekWebState
  error: string | null
  port: number
  cwd: string | null
  stderrTail: string
  workspaceGuardTimer: NodeJS.Timeout | null
}

export type {
  DeepSeekAgentPreset,
  DeepSeekProjectStatus,
  DeepSeekSessionSummary,
  DeepSeekWebState,
  DeepSeekWebStatus
}

export type DeepSeekWebManagerOptions = {
  /** Enumerate every known Orca worktree path (for the auto-scan overview). */
  listWorktreePaths?: () => string[]
}

export class DeepSeekWebManager {
  private instance: DeepSeekInstance | null = null
  /** The worktree the SPA should currently be pinned to. */
  private activePath: string | null = null
  private readonly listWorktreePaths: () => string[]
  private readonly ports: DeepSeekPortRegistry
  // Why: DeepSeekPage's effect and the tab opener can call start() for the
  // same project concurrently; serialize so only one spawn happens.
  private readonly starting = new Map<string, Promise<DeepSeekWebStatus>>()

  constructor(options: DeepSeekWebManagerOptions = {}) {
    this.listWorktreePaths = options.listWorktreePaths ?? (() => [])
    this.ports = new DeepSeekPortRegistry(join(app.getPath('userData'), 'deepseek', 'ports.json'))
  }

  /** Pid-file + port-registry home under userData. */
  private dataDir(): string {
    return join(app.getPath('userData'), 'deepseek')
  }

  private daemon(): DeepSeekInstance {
    if (this.instance) {
      return this.instance
    }
    const daemon: DeepSeekInstance = {
      projectPath: DAEMON_KEY,
      child: null,
      state: 'stopped',
      error: null,
      port: this.ports.portFor(DAEMON_KEY),
      cwd: null,
      stderrTail: '',
      workspaceGuardTimer: null
    }
    this.instance = daemon
    return daemon
  }

  private instanceUrl(instance: DeepSeekInstance): string {
    return `http://127.0.0.1:${instance.port}`
  }

  private isChildAlive(instance: DeepSeekInstance): boolean {
    return (
      instance.child !== null &&
      instance.child.exitCode === null &&
      instance.child.signalCode === null
    )
  }

  private isRunning(instance: DeepSeekInstance): boolean {
    return instance.state === 'running' && this.isChildAlive(instance)
  }

  getStatus(): DeepSeekWebStatus {
    const instance = this.daemon()
    return {
      state: instance.state,
      port: instance.port,
      url: instance.state === 'running' ? this.instanceUrl(instance) : null,
      pid: instance.child?.pid ?? null,
      cwd: this.activePath,
      error: instance.error
    }
  }

  /** All sessions on the daemon (every workspace's sessions). */
  async listSessions(): Promise<DeepSeekSessionSummary[]> {
    const instance = this.daemon()
    if (!this.isRunning(instance)) {
      return []
    }
    return this.hostFor(instance).listSessions()
  }

  /** All agent presets the daemon exposes (system plus user roots). */
  async listAgentPresets(): Promise<DeepSeekAgentPreset[]> {
    const instance = this.daemon()
    if (!this.isRunning(instance)) {
      return []
    }
    return this.hostFor(instance).listAgentPresets()
  }

  private hostFor(instance: DeepSeekInstance): DeepSeekHostClient {
    return new DeepSeekHostClient(() => this.instanceUrl(instance))
  }

  /**
   * Persist the daemon's default agent preset for new sessions and restart the
   * daemon so the new default is live (the host caches it at boot).
   */
  async setDefaultAgentPreset(id: string): Promise<DeepSeekWebStatus> {
    const instance = this.daemon()
    const presets = await this.hostFor(instance).listAgentPresets()
    if (!presets.some((preset) => preset.id === id)) {
      instance.state = 'errored'
      instance.error = `Unknown agent preset: ${id}`
      return this.getStatus()
    }
    setDefaultAgentPresetInSettings(harnessHome(), id)
    const cwd = this.activePath
    this.stop()
    return this.start(cwd)
  }

  /**
   * Keep the active worktree registered as a Host Workspace: re-creates it
   * when deleted from the registry, and drops stale registrations when the
   * directory no longer exists so a future re-create is clean.
   */
  private async ensureWorkspaceRegistration(cwd: string | null): Promise<void> {
    const instance = this.daemon()
    if (!this.isRunning(instance)) {
      return
    }
    await this.hostFor(instance).ensureWorkspaceRegistration(cwd)
  }

  private startWorkspaceGuard(): void {
    this.stopWorkspaceGuard()
    const instance = this.daemon()
    instance.workspaceGuardTimer = setInterval(() => {
      void this.ensureWorkspaceRegistration(this.activePath)
    }, 10_000)
  }

  private stopWorkspaceGuard(): void {
    const instance = this.daemon()
    if (instance.workspaceGuardTimer) {
      clearInterval(instance.workspaceGuardTimer)
    }
    instance.workspaceGuardTimer = null
  }

  /**
   * Every known Orca worktree with the daemon's port and per-project session
   * counts — feeds the in-app overview table. Removed worktrees drop out via
   * listWorktreePaths; the single daemon stays regardless.
   */
  async listProjects(): Promise<DeepSeekProjectStatus[]> {
    const instance = this.daemon()
    const sessions = this.isRunning(instance)
      ? await this.hostFor(instance)
          .listSessions()
          .catch(() => [])
      : []
    const byCwd = new Map<string, number>()
    for (const session of sessions) {
      byCwd.set(session.cwd, (byCwd.get(session.cwd) ?? 0) + 1)
    }
    return this.listWorktreePaths().map((projectPath) => ({
      projectPath,
      port: instance.port,
      state: instance.state,
      pid: instance.child?.pid ?? null,
      sessionCount: byCwd.get(projectPath) ?? 0,
      error: instance.error
    }))
  }

  /**
   * Ensure the single daemon is running and register the project as a Host
   * Workspace; make it the active one the SPA should pin. A live daemon is
   * reused — switching projects never restarts it. Concurrent starts share
   * one spawn.
   */
  start(projectPath: string | null): Promise<DeepSeekWebStatus> {
    if (!projectPath) {
      return Promise.resolve(this.getStatus())
    }
    const inFlight = this.starting.get(projectPath)
    if (inFlight) {
      return inFlight
    }
    const promise = this.spawnDaemon(projectPath)
    this.starting.set(projectPath, promise)
    void promise.finally(() => {
      this.starting.delete(projectPath)
    })
    return promise
  }

  private async spawnDaemon(projectPath: string): Promise<DeepSeekWebStatus> {
    const instance = this.daemon()
    this.activePath = projectPath
    if (this.isRunning(instance)) {
      // Why: a daemon spawned before `dsh setup` serves the SPA shell but 404s
      // every RPC; recycling it beats pinning the tab to a host that can never
      // load sessions.
      const backendUp = await this.hostFor(instance)
        .probe()
        .then(
          () => true,
          () => false
        )
      if (backendUp) {
        await this.ensureWorkspaceRegistration(projectPath)
        return this.getStatus()
      }
      this.resetChild(instance)
    }
    // Why: a main-process restart or crash orphans the previous dsh child on
    // the registry port; reap it so the fresh spawn rebinds the SAME port
    // instead of walking up and running a second daemon over one DSH_HOME.
    await reapOrphanDaemon(this.dataDir())
    // Why: a 'starting' child may still be alive; kill it before re-spawning
    // so a restart never leaks a second host on the same port. Reset in place
    // (not via stop()) so the singleton instance + activePath survive and
    // getStatus() still reports this instance instead of a fresh stopped one.
    this.resetChild(instance)
    const dshBin = resolveDshBin()
    if (!dshBin) {
      instance.state = 'errored'
      instance.error =
        'dsh not found. Install it with: npm install -g dsh-terminal-plugin, then run: dsh setup <deepseek-harness-dir>'
      return this.getStatus()
    }
    instance.state = 'starting'
    instance.error = null
    // Why: force the harness browser client to English (its default is zh-CN).
    ensureEnglishHarnessLocale(harnessHome())
    // Why: a non-Orca process may hold the registered port; walk up on
    // collision and persist the rebound port so the next start reuses it.
    instance.port = await resolveFreeLoopbackPort(instance.port)
    this.ports.reassign(DAEMON_KEY, instance.port)

    instance.child = spawnDeepSeekHost(dshBin, harnessHome(), instance)
    // Why: record the child so the next spawn can reap it if this main process
    // dies without running stop() (dev-mode restarts, crashes).
    recordDaemonPid(this.dataDir(), instance.child.pid ?? 0, dshBin)
    // Why: wait for the HTTP listener so the webview load doesn't race the host.
    await waitForHttpListener({
      url: this.instanceUrl(instance),
      timeoutMs: 45_000,
      isChildAlive: () => this.isChildAlive(instance)
    })
    if (!this.isChildAlive(instance)) {
      return this.getStatus()
    }
    // Why: the SPA root answers 200 even when the RPC backend is down (dsh not
    // set up), which used to render as a silently broken tab; surface it.
    const backendUp = await this.hostFor(instance)
      .probe()
      .then(
        () => true,
        () => false
      )
    if (!backendUp) {
      instance.state = 'errored'
      instance.error =
        'DeepSeek Harness host is up but its API is unavailable. Run `dsh setup <deepseek-harness-dir>` once, then retry.'
      return this.getStatus()
    }
    instance.state = 'running'
    // Why: registering the worktree as a Host Workspace makes the web UI's
    // session flow auto-target it instead of asking to pick a directory.
    await this.ensureWorkspaceRegistration(projectPath)
    this.startWorkspaceGuard()
    return this.getStatus()
  }

  /** Stop the single daemon (its port stays reserved in the registry). */
  stop(): void {
    const instance = this.instance
    if (!instance) {
      return
    }
    this.resetChild(instance)
    instance.cwd = null
    this.activePath = null
  }

  /**
   * Kill any live child and reset runtime fields on the SAME instance so the
   * singleton reference and activePath survive a re-spawn.
   */
  private resetChild(instance: DeepSeekInstance): void {
    this.stopWorkspaceGuard()
    const child = instance.child
    instance.child = null
    if (child && child.exitCode === null) {
      child.kill()
    }
    // Why: a child we killed ourselves leaves no orphan; drop the reap record
    // so a recycled pid is never misidentified as our daemon.
    clearDaemonPid(this.dataDir())
    instance.state = 'stopped'
    instance.error = null
  }

  /**
   * Sessions from our live daemon, or — when this process owns no child (fresh
   * start next to an inherited host) — probed straight off the registry port,
   * mirroring the OpenChamber inherited-port busy probe.
   */
  async listSessionsProbed(): Promise<DeepSeekSessionSummary[]> {
    const instance = this.daemon()
    if (this.isRunning(instance)) {
      return this.hostFor(instance).listSessions()
    }
    return new DeepSeekHostClient(() => `http://127.0.0.1:${instance.port}`).listSessions()
  }

  /** Alias for stop() kept for the table's per-row kill action. */
  stopProject(_projectPath: string): void {
    this.stop()
  }
}
