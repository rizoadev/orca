/**
 * Manages the DeepSeek Harness web host for the in-app DeepSeek view.
 * Spawns `dsh --profile web` (the dsh-terminal-plugin front door) with the
 * active worktree as its working directory, waits for the HTTP listener, and
 * stops the host on quit or when the workspace changes.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { DeepSeekHostClient } from './deepseek-host-client'
import { ensureEnglishHarnessLocale, mergeHarnessSettings } from './deepseek-harness-settings'
import type {
  DeepSeekAgentPreset,
  DeepSeekSessionSummary,
  DeepSeekWebState,
  DeepSeekWebStatus
} from '../../shared/deepseek-web-types'

const DEFAULT_PORT = 3080

// Why: the web host spawns its own Harness runtime home; keep it isolated from
// the user's real ~/.dsh so Orca-managed sessions stay scoped to Orca's data.
function harnessHome(): string {
  return process.env.DSH_HOME?.trim() || `${app.getPath('userData')}/dsh-home`
}

// Why: Electron may launch with a bare PATH (e.g. from a desktop launcher) that
// omits npm's global bin, where `dsh` lives. Resolve the binary explicitly
// instead of relying on the inherited environment.
function resolveDshBin(): string | null {
  const override = process.env.DSH_BIN?.trim()
  if (override && existsSync(override)) {
    return override
  }
  const pathDirs = (process.env.PATH ?? '').split(':').filter(Boolean)
  for (const dir of pathDirs) {
    for (const name of ['dsh', 'dsh.cmd', 'dsh.exe']) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  // Why: `npm i -g` installs into the npm global prefix; probe the common
  // locations directly so a PATH-less Electron process still finds it.
  const npmGlobalCandidates = [
    process.env.NPM_CONFIG_PREFIX,
    join(homedir(), '.npm-global'),
    join(homedir(), 'node_modules')
  ]
  for (const prefix of npmGlobalCandidates) {
    if (!prefix) {
      continue
    }
    for (const name of ['dsh', 'dsh.cmd', 'dsh.exe']) {
      const candidate = join(prefix, 'bin', name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  // Why: nvm-style installs put global bins under the nvm node prefix, which
  // PATH-less GUI launches and the fixed candidate list both miss; `npm prefix -g`
  // reports the real prefix cheaply.
  try {
    const prefix = execFileSync('npm', ['prefix', '-g'], {
      encoding: 'utf8',
      timeout: 3_000
    }).trim()
    if (prefix) {
      for (const name of ['dsh', 'dsh.cmd', 'dsh.exe']) {
        const candidate = join(prefix, 'bin', name)
        if (existsSync(candidate)) {
          return candidate
        }
      }
    }
  } catch {
    // npm unavailable (e.g. bare GUI PATH) — fall through; PATH/DSH_BIN still apply
  }
  return null
}

export type { DeepSeekAgentPreset, DeepSeekSessionSummary, DeepSeekWebState, DeepSeekWebStatus }

export class DeepSeekWebManager {
  private child: ChildProcess | null = null
  private state: DeepSeekWebState = 'stopped'
  private error: string | null = null
  private port = DEFAULT_PORT
  private cwd: string | null = null
  private workspaceGuardTimer: NodeJS.Timeout | null = null

  getUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  getStatus(): DeepSeekWebStatus {
    return {
      state: this.state,
      port: this.port,
      url: this.state === 'running' ? this.getUrl() : null,
      pid: this.child?.pid ?? null,
      cwd: this.cwd,
      error: this.error
    }
  }

  /** POST-RPC against the running host (same envelope the dsh CLI client uses). */
  private readonly host = new DeepSeekHostClient(() => this.getUrl())

  /**
   * Persist the host's default agent preset for new sessions and restart the
   * host so the new default is live (the host caches it at boot).
   */
  async setDefaultAgentPreset(id: string): Promise<DeepSeekWebStatus> {
    const presets = await this.host.listAgentPresets()
    if (!presets.some((preset) => preset.id === id)) {
      this.state = 'errored'
      this.error = `Unknown agent preset: ${id}`
      return this.getStatus()
    }
    mergeHarnessSettings(harnessHome(), (doc) => {
      const agentPresets =
        doc['agent-presets'] && typeof doc['agent-presets'] === 'object'
          ? (doc['agent-presets'] as Record<string, unknown>)
          : {}
      agentPresets.default = id
      doc['agent-presets'] = agentPresets
    })
    const cwd = this.cwd
    this.stop()
    return this.start(cwd)
  }

  /** All sessions on the running host (slim projection for the in-app list). */
  async listSessions(): Promise<DeepSeekSessionSummary[]> {
    if (!this.isRunning()) {
      return []
    }
    return this.host.listSessions()
  }

  /** All agent presets the running host exposes (system plus user roots). */
  async listAgentPresets(): Promise<DeepSeekAgentPreset[]> {
    if (!this.isRunning()) {
      return []
    }
    return this.host.listAgentPresets()
  }

  /**
   * Keep the active worktree registered as a Host Workspace: re-creates it
   * when deleted from the registry, and drops stale registrations when the
   * directory no longer exists so a future re-create is clean.
   */
  private async ensureWorkspaceRegistration(): Promise<void> {
    if (!this.isRunning()) {
      return
    }
    await this.host.ensureWorkspaceRegistration(this.cwd)
  }

  // Why: the registry can change out from under us (workspace deleted in the
  // web UI, directory removed); re-ensure every few seconds while running.
  private startWorkspaceGuard(): void {
    this.stopWorkspaceGuard()
    this.workspaceGuardTimer = setInterval(() => {
      void this.ensureWorkspaceRegistration()
    }, 10_000)
  }

  private stopWorkspaceGuard(): void {
    if (this.workspaceGuardTimer) {
      clearInterval(this.workspaceGuardTimer)
      this.workspaceGuardTimer = null
    }
  }

  /** The spawned child is alive regardless of the reported state (which is 'starting' while the listener comes up). */
  private isChildAlive(): boolean {
    return this.child !== null && this.child.exitCode === null && this.child.signalCode === null
  }

  isRunning(): boolean {
    return this.state === 'running' && this.isChildAlive()
  }

  async start(cwd: string | null): Promise<DeepSeekWebStatus> {
    // Why: the web UI reads the host's cwd as its workspace; switching the
    // active worktree restarts the host so the project list follows Orca.
    if (this.isRunning() && this.cwd === cwd) {
      return this.getStatus()
    }
    this.stop()
    if (!cwd) {
      return this.getStatus()
    }
    const dshBin = resolveDshBin()
    if (!dshBin) {
      this.state = 'errored'
      this.error =
        'dsh not found. Install it with: npm install -g dsh-terminal-plugin, then run: dsh setup <deepseek-harness-dir>'
      return this.getStatus()
    }
    this.state = 'starting'
    this.error = null
    this.cwd = cwd
    // Why: force the harness browser client to English (its default is zh-CN).
    ensureEnglishHarnessLocale(harnessHome())
    // Why: bind port 0 so the OS picks a free one; a leftover host from a
    // crashed run (or any other occupant) on a fixed port would EADDRINUSE and
    // the view would never come up. The real port is parsed from stdout below.
    this.port = 0

    const child = spawn(dshBin, ['--profile', 'web', '--port', String(this.port)], {
      // Why: the host reads `<cwd>/.env` at boot and crashes if it declares a
      // bootstrap-only name (PATH, NODE_OPTIONS, GIT_*, DSH_*, …). Spawn from
      // the isolated harness home instead of the worktree so a project .env
      // can never take the host down; the worktree is pinned via the
      // workspace registration below, not the spawn cwd.
      cwd: harnessHome(),
      env: {
        ...process.env,
        DSH_HOME: harnessHome()
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    })
    // Why: `dsh web` prints its composed URL (e.g. "dsh web: http://127.0.0.1:38921")
    // once the listener is up; parse the actual port instead of assuming one.
    let stdoutTail = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      if (this.child !== child) {
        return
      }
      stdoutTail = (stdoutTail + chunk.toString()).slice(-2_000)
      const match = /http:\/\/[^/\s]+:(\d+)/.exec(stdoutTail)
      if (match) {
        this.port = Number(match[1])
      }
    })
    let stderrTail = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2_000)
    })
    this.child = child
    child.once('exit', (code) => {
      if (this.child === child) {
        this.state = 'stopped'
        if (code !== 0) {
          this.state = 'errored'
          this.error = `DeepSeek web host exited with code ${code}${stderrTail ? `: ${stderrTail.trim().split('\n').slice(-4).join(' | ')}` : ''}`
        }
      }
    })
    child.once('error', (err) => {
      if (this.child === child) {
        this.state = 'errored'
        this.error = err.message
      }
    })

    // Why: wait for the HTTP listener so the webview load doesn't race the host.
    await this.waitUntilListening(30_000)
    // Why: registering the active worktree as a Host Workspace makes the web
    // UI's session flow auto-target it instead of asking to pick a directory.
    if (this.isRunning() && cwd) {
      await this.ensureWorkspaceRegistration()
      this.startWorkspaceGuard()
    }
    return this.getStatus()
  }

  private async waitUntilListening(timeoutMs: number): Promise<void> {
    const startedAt = Date.now()
    const probe = async (): Promise<boolean> => {
      try {
        const res = await fetch(this.getUrl(), {
          // Why: a listener that accepts but never responds must not hang the
          // webview load; abort each probe so the loop keeps moving.
          signal: AbortSignal.timeout(2_000)
        })
        return res.status < 500
      } catch {
        return false
      }
    }
    while (Date.now() - startedAt < timeoutMs) {
      // Why: child liveness, not isRunning() — the state is still 'starting'
      // until the first successful probe flips it to 'running'.
      if (!this.isChildAlive()) {
        return
      }
      if (await probe()) {
        this.state = 'running'
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (this.isChildAlive() && this.port > 0) {
      // Why: the listener may accept connections but reject the probe path;
      // treat the process being alive (and a known port) as enough for the
      // webview to retry.
      this.state = 'running'
    } else if (this.port <= 0) {
      this.state = 'errored'
      this.error = 'DeepSeek web host started but did not report a listening port'
    }
  }

  stop(): void {
    const child = this.child
    this.child = null
    this.stopWorkspaceGuard()
    if (child && child.exitCode === null) {
      child.kill()
    }
    this.state = 'stopped'
    this.cwd = null
  }
}
