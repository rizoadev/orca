/**
 * Manages the OpenChamber web server for the in-app OpenChamber view.
 * Spawns the OpenChamber web server (from the OpenChamber repo) as a child
 * process with an isolated data dir and the active worktree as its OpenCode
 * working directory, waits for the HTTP listener, and stops the server on quit
 * or when the workspace changes.
 *
 * Shape mirrors `DeepSeekWebManager`: a loopback web host owned by Orca, with
 * the difference that OpenChamber additionally requires an OpenCode binary
 * (the agent engine it manages behind its UI). The manager resolves that
 * binary and hands it to the server via OPENCODE_BINARY.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import type {
  OpenChamberSessionSummary,
  OpenChamberWebState,
  OpenChamberWebStatus
} from '../../shared/openchamber-web-types'

// Why: bind port 0 and let the OS pick a free one is what DeepSeek does, but
// OpenChamber's readiness is signalled over IPC which a plain stream spawn
// cannot capture. Instead we resolve a free loopback port ourselves, spawn the
// server pinned to it, and probe the HTTP listener. Default preferred port.
const PREFERRED_PORT = 3210

// Why: Electron may launch with a bare PATH (e.g. desktop launcher) that omits
// the OpenCode CLI install locations. Resolve the binary explicitly rather
// than relying on the inherited environment, mirroring DeepSeek's dsh lookup.
function resolveOpencodeBin(): string | null {
  const override = process.env.OPENCODE_BIN?.trim() || process.env.OPENCODE_BINARY?.trim()
  if (override && existsSync(override)) {
    return override
  }
  const pathDirs = (process.env.PATH ?? '').split(':').filter(Boolean)
  for (const dir of pathDirs) {
    for (const name of ['opencode', 'opencode.cmd', 'opencode.exe']) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  // Why: `bun add -g @opencode-ai/cli` installs into the global bin; probe the
  // common locations directly so a PATH-less Electron process still finds it.
  const npmGlobalCandidates = [
    process.env.NPM_CONFIG_PREFIX,
    process.env.BUN_INSTALL ? join(process.env.BUN_INSTALL, 'bin') : null,
    join(homedir(), '.npm-global'),
    join(homedir(), '.bun', 'bin')
  ]
  for (const prefix of npmGlobalCandidates) {
    if (!prefix) {
      continue
    }
    for (const name of ['opencode', 'opencode.cmd', 'opencode.exe']) {
      const candidate = join(prefix, 'bin', name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  return null
}

/** Resolve a real node binary: Orca's own process.execPath is the Electron
 * binary, which cannot run a plain Node ESM entrypoint. Pick `node` from PATH
 * (or an explicit override) instead, mirroring PaseoDaemonManager. */
function resolveNodeBin(): string {
  const override = process.env.OPENCHAMBER_NODE_BIN?.trim()
  if (override && existsSync(override)) {
    return override
  }
  return (
    (process.env.PATH ?? '')
      .split(':')
      .map((dir) => join(dir, 'node'))
      .find((candidate) => existsSync(candidate)) || 'node'
  )
}

/** Resolve the OpenChamber web package root from env or the known sandbox path. */
function resolveOpenChamberRepo(): string | null {
  const override = process.env.OPENCHAMBER_REPO_DIR?.trim()
  if (override && existsSync(override)) {
    return override
  }
  const defaultRepo = join(homedir(), 'PROJECTS', 'SANDBOX', 'openchamber')
  return existsSync(defaultRepo) ? defaultRepo : null
}

/** Resolve the server entrypoint file under the repo, preferring a built one. */
function resolveServerEntrypoint(repo: string): string | null {
  const candidates = [
    join(repo, 'packages', 'web', 'server', 'index.js'),
    join(repo, 'packages', 'web', 'dist', 'server', 'index.js')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

export type { OpenChamberSessionSummary, OpenChamberWebState, OpenChamberWebStatus }

export class OpenChamberWebManager {
  private child: ChildProcess | null = null
  private state: OpenChamberWebState = 'stopped'
  private error: string | null = null
  private port = PREFERRED_PORT
  private cwd: string | null = null
  private opencodeBinary: string | null = null

  getUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  getStatus(): OpenChamberWebStatus {
    return {
      state: this.state,
      port: this.port,
      url: this.state === 'running' ? this.getUrl() : null,
      pid: this.child?.pid ?? null,
      opencodeBinary: this.opencodeBinary,
      cwd: this.cwd,
      error: this.error
    }
  }

  /** Resolve a free loopback port, preferring the default. */
  private async resolveFreePort(): Promise<number> {
    return new Promise((resolve) => {
      const probe = (candidate: number): void => {
        const server = createServer()
        server.once('error', () => {
          server.close()
          probe(candidate + 1)
        })
        server.listen(candidate, '127.0.0.1', () => {
          const { port } = server.address() as { port: number }
          server.close(() => resolve(port))
        })
      }
      probe(PREFERRED_PORT)
    })
  }

  /** The spawned child is alive regardless of the reported state (which is 'starting' while the listener comes up). */
  private isChildAlive(): boolean {
    return this.child !== null && this.child.exitCode === null && this.child.signalCode === null
  }

  isRunning(): boolean {
    return this.state === 'running' && this.isChildAlive()
  }

  /** All sessions on the running server (slim projection for the in-app list). */
  async listSessions(): Promise<OpenChamberSessionSummary[]> {
    if (!this.isRunning()) {
      return []
    }
    try {
      const res = await fetch(`${this.getUrl()}/api/session`, {
        signal: AbortSignal.timeout(5_000)
      })
      if (!res.ok) {
        return []
      }
      const body = (await res.json()) as unknown[] | { data?: unknown[] }
      const items = Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : []
      return items.map((item) => {
        const session = (item ?? {}) as {
          id?: unknown
          directory?: unknown
          time?: { updated?: unknown; created?: unknown }
          title?: unknown
        }
        return {
          sessionId: typeof session.id === 'string' ? session.id : '',
          directory: typeof session.directory === 'string' ? session.directory : (this.cwd ?? ''),
          title: typeof session.title === 'string' ? session.title : null,
          updatedAt:
            ((typeof session.time?.updated === 'number' ? session.time.updated : 0) ||
              (typeof session.time?.created === 'number' ? session.time.created : 0)) ??
            0
        }
      })
    } catch {
      return []
    }
  }

  /**
   * Attach the active worktree as the server's working directory. The server's
   * OpenCode instance is directory-scoped; pointing it at the active worktree
   * is how the web UI's session flow auto-targets the project the user is
   * looking at. No-op when already attached to that directory.
   */
  async attachDirectory(directory: string | null): Promise<void> {
    if (!this.isRunning() || !directory) {
      return
    }
    if (this.cwd === directory) {
      return
    }
    try {
      const res = await fetch(`${this.getUrl()}/api/opencode/directory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: directory, create: false }),
        signal: AbortSignal.timeout(10_000)
      })
      // Why: only commit cwd on success; a failed attach must not pretend the
      // server is scoped to a directory it could not activate.
      if (res.ok) {
        this.cwd = directory
      }
    } catch {
      // Best-effort — the webview session list drives the project selection.
    }
  }

  async start(cwd: string | null): Promise<OpenChamberWebStatus> {
    // Why: the web server reads its OpenCode working directory from the repo's
    // setDirectory; switching the active worktree restarts the server so the
    // session list follows Orca.
    if (this.isRunning() && this.cwd === cwd) {
      return this.getStatus()
    }
    this.stop()
    if (!cwd) {
      return this.getStatus()
    }
    const repo = resolveOpenChamberRepo()
    if (!repo) {
      this.state = 'errored'
      this.error =
        'OpenChamber repo not found. Install it or set OPENCHAMBER_REPO_DIR to the openchamber checkout.'
      return this.getStatus()
    }
    const entrypoint = resolveServerEntrypoint(repo)
    if (!entrypoint) {
      this.state = 'errored'
      this.error = `OpenChamber server build not found under ${repo}. Build @openchamber/web first.`
      return this.getStatus()
    }
    const opencodeBin = resolveOpencodeBin()
    if (!opencodeBin) {
      this.state = 'errored'
      this.error =
        'opencode CLI not found in PATH. Install it with: bun add -g @opencode-ai/cli (or set OPENCODE_BIN), then retry.'
      return this.getStatus()
    }
    this.opencodeBinary = opencodeBin
    // Why: OpenChamber's readiness is signalled over IPC; a plain stream spawn
    // cannot capture it, so pin the server to a port we own and probe it.
    this.port = await this.resolveFreePort()
    this.state = 'starting'
    this.error = null
    // Why: do NOT set this.cwd here — attachDirectory() early-returns when
    // this.cwd already equals the target, which would skip the POST that
    // actually points the server at the worktree. cwd is committed only on a
    // successful attach below.

    // Why: isolate OpenChamber's data dir so Orca-managed sessions, drafts and
    // config stay scoped to Orca instead of the user's real ~/.config/openchamber.
    const dataDir = join(app.getPath('userData'), 'openchamber', 'orca')

    const child = spawn(
      resolveNodeBin(),
      [entrypoint, '--port', String(this.port), '--host', '127.0.0.1'],
      {
        // Why: spawn from the repo root so node_modules resolves (the server
        // imports reflect-metadata and other package deps). The data dir is
        // isolated via OPENCHAMBER_DATA_DIR; the worktree is pinned separately
        // via attachDirectory, so a project .env at the worktree can never take
        // the server down.
        cwd: repo,
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
          this.error = `OpenChamber server exited with code ${code}${stderrTail ? `: ${stderrTail.trim().split('\n').slice(-4).join(' | ')}` : ''}`
        }
      }
    })
    child.once('error', (err) => {
      if (this.child === child) {
        this.state = 'errored'
        this.error = err.message
      }
    })

    // Why: wait for the HTTP listener so the webview load doesn't race the server.
    const ready = await this.waitUntilListening(45_000)
    // Why: connect the active worktree to the server's directory scope once the
    // listener is up, matching how DeepSeek registers the worktree as a workspace.
    if (this.isRunning() && ready && cwd) {
      await this.attachDirectory(cwd)
    }
    return this.getStatus()
  }

  private async waitUntilListening(timeoutMs: number): Promise<boolean> {
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
        return false
      }
      if (await probe()) {
        this.state = 'running'
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (this.isChildAlive()) {
      // Why: the listener may accept connections but reject the probe path;
      // treat the process being alive as enough for the webview to retry.
      this.state = 'running'
      return true
    }
    return false
  }

  stop(): void {
    const child = this.child
    this.child = null
    if (child && child.exitCode === null) {
      child.kill()
    }
    this.state = 'stopped'
    this.cwd = null
  }
}
