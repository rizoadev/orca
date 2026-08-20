/**
 * Manages the Paseo daemon lifecycle for the in-app Paseo view.
 * Spawns the daemon from the bundled paseo repo (env PASEO_REPO_DIR or
 * ~/PROJECTS/SANDBOX/paseo), isolates its home under Orca's userData dir,
 * enables the built-in web UI (PASEO_WEB_UI_ENABLED=1), and stops it on quit.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { app } from 'electron'
import type { PaseoDaemonState, PaseoDaemonStatus } from '../../shared/paseo-types'

const DEFAULT_PASEO_REPO = join(homedir(), 'PROJECTS', 'SANDBOX', 'paseo')
// Why: the desktop Paseo app may already own 6768 (its default); pick a free
// port instead so the in-app daemon never collides with it.
const PREFERRED_PORT = 6768

export type { PaseoDaemonState, PaseoDaemonStatus }

function resolvePaseoRepo(): string {
  return process.env.PASEO_REPO_DIR?.trim() || DEFAULT_PASEO_REPO
}

function resolveEntrypoint(repo: string): string | null {
  const candidates = [
    join(repo, 'packages', 'server', 'dist', 'scripts', 'supervisor-entrypoint.js'),
    join(repo, 'packages', 'server', 'dist', 'scripts', 'supervisor-entrypoint.cjs')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

export class PaseoDaemonManager {
  private child: ChildProcess | null = null
  private state: PaseoDaemonState = 'stopped'
  private error: string | null = null
  private port = PREFERRED_PORT

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

  /** Resolve the daemon URL without starting anything (for the webview src). */
  getUrl(): string {
    return `http://127.0.0.1:${this.port}`
  }

  getStatus(): PaseoDaemonStatus {
    return {
      state: this.state,
      port: this.port,
      url: this.state === 'running' ? this.getUrl() : null,
      pid: this.child?.pid ?? null,
      error: this.error
    }
  }

  /** The spawned child is alive regardless of the reported state (which is 'starting' while the listener comes up). */
  private isChildAlive(): boolean {
    return this.child !== null && this.child.exitCode === null && this.child.signalCode === null
  }

  isRunning(): boolean {
    return this.state === 'running' && this.isChildAlive()
  }

  async start(): Promise<PaseoDaemonStatus> {
    if (this.isRunning()) {
      return this.getStatus()
    }
    this.port = await this.resolveFreePort()
    const repo = resolvePaseoRepo()
    const entrypoint = resolveEntrypoint(repo)
    if (!entrypoint) {
      this.state = 'errored'
      this.error = `Paseo server build not found under ${repo}. Run pnpm build:server + build:daemon-web-ui first.`
      return this.getStatus()
    }

    // Why: Paseo holds a pid-lock per PASEO_HOME — a second daemon sharing the
    // same home is rejected outright. The desktop Paseo app may already own
    // <userData>/paseo-home, so Orca uses its own home subdirectory and a free
    // port; the two daemons (and their chat histories) stay fully independent.
    const paseoHome = join(app.getPath('userData'), 'paseo-home', 'orca')
    // Why: Orca's own process.execPath is the Electron binary, which cannot
    // run a plain Node entrypoint; resolve a real node from PATH (or an
    // explicit PASEO_NODE_BIN override) instead.
    const nodeBin =
      process.env.PASEO_NODE_BIN?.trim() ||
      (process.env.PATH ?? '')
        .split(':')
        .map((dir) => join(dir, 'node'))
        .find((candidate) => existsSync(candidate)) ||
      'node'
    this.state = 'starting'
    this.error = null

    const child = spawn(nodeBin, [entrypoint], {
      cwd: repo,
      env: {
        ...process.env,
        PASEO_HOME: paseoHome,
        PASEO_LISTEN: `127.0.0.1:${this.port}`,
        PASEO_WEB_UI_ENABLED: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    })
    // Why: capture stderr so a failed spawn surfaces the real daemon error
    // (e.g. missing node, bad env) instead of a bare exit code.
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
          this.error = `Paseo daemon exited with code ${code}${stderrTail ? `: ${stderrTail.trim().split('\n').at(-1)}` : ''}`
        }
      }
    })
    child.once('error', (err) => {
      if (this.child === child) {
        this.state = 'errored'
        this.error = err.message
      }
    })

    // Why: wait for the HTTP listener to come up so the webview load doesn't
    // race the daemon; poll instead of sleeping a fixed amount.
    await this.waitUntilListening(30_000)
    return this.getStatus()
  }

  private async waitUntilListening(timeoutMs: number): Promise<void> {
    const startedAt = Date.now()
    const probe = async (): Promise<boolean> => {
      try {
        const res = await fetch(this.getUrl(), { method: 'GET' })
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
    if (this.isChildAlive()) {
      // Why: the listener may accept connections but reject the probe path;
      // treat the process being alive as enough for the webview to retry.
      this.state = 'running'
    }
  }

  stop(): void {
    const child = this.child
    this.child = null
    if (child && child.exitCode === null) {
      child.kill()
    }
    this.state = 'stopped'
  }
}
