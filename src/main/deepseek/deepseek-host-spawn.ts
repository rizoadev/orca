/**
 * Spawn + lifecycle wiring for a DeepSeek Harness host child, kept out of the
 * manager for its line budget. The manager owns the instance state; this
 * module spawns `dsh --profile web` on the given port and mutates the
 * instance as the child lives/dies.
 */
import { spawn, type ChildProcess } from 'node:child_process'

export type DeepSeekHostTarget = {
  port: number
  child: ChildProcess | null
  state: 'stopped' | 'starting' | 'running' | 'errored'
  error: string | null
  stderrTail: string
}

/**
 * Spawn the host and wire stdout (parses the real bound port), stderr (tail
 * for error messages), and exit/error handlers onto the shared target.
 */
export function spawnDeepSeekHost(
  dshBin: string,
  home: string,
  target: DeepSeekHostTarget
): ChildProcess {
  const child = spawn(dshBin, ['--profile', 'web', '--port', String(target.port)], {
    // Why: the host reads `<cwd>/.env` at boot and crashes if it declares a
    // bootstrap-only name (PATH, NODE_OPTIONS, GIT_*, DSH_*, …). Spawn from
    // the isolated harness home instead of the worktree so a project .env
    // can never take the host down; the worktree is pinned via the
    // workspace registration below, not the spawn cwd.
    cwd: home,
    env: {
      ...process.env,
      DSH_HOME: home
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  })
  // Why: `dsh web` prints its composed URL (e.g. "dsh web: http://127.0.0.1:38921")
  // once the listener is up; parse the actual port instead of assuming one.
  let stdoutTail = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    if (target.child !== child) {
      return
    }
    stdoutTail = (stdoutTail + chunk.toString()).slice(-2_000)
    const match = /http:\/\/[^/\s]+:(\d+)/.exec(stdoutTail)
    if (match) {
      target.port = Number(match[1])
    }
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    target.stderrTail = (target.stderrTail + chunk.toString()).slice(-2_000)
  })
  child.once('exit', (code) => {
    if (target.child !== child) {
      return
    }
    target.state = 'stopped'
    if (code !== 0) {
      target.state = 'errored'
      target.error = `DeepSeek web host exited with code ${code}${target.stderrTail ? `: ${target.stderrTail.trim().split('\n').slice(-4).join(' | ')}` : ''}`
    }
  })
  child.once('error', (err) => {
    if (target.child === child) {
      target.state = 'errored'
      target.error = err.message
    }
  })
  return child
}
