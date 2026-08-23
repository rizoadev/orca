import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import * as pty from 'node-pty'
import type { SshTarget } from '../../shared/ssh-types'
import type {
  RemoteShellDataEvent,
  RemoteShellExitEvent,
  RemoteShellSpawnArgs,
  RemoteShellSpawnResult
} from '../../shared/remote-shell-types'
import { buildSshArgs } from '../ssh/system-ssh-args'
import { findSystemSsh } from '../ssh/system-ssh-binary'

type ShellSession = {
  pty: pty.IPty
  targetId: string
}

export type SshShellSessionService = {
  spawn(args: RemoteShellSpawnArgs): RemoteShellSpawnResult
  write(shellSessionId: string, data: string): boolean
  resize(shellSessionId: string, cols: number, rows: number): boolean
  kill(shellSessionId: string): boolean
  listSessionIds(): string[]
  onData(callback: (event: RemoteShellDataEvent) => void): () => void
  onExit(callback: (event: RemoteShellExitEvent) => void): () => void
  disposeAll(): void
}

/** Build the ssh command line for an interactive login shell on a target.
 *  Exported for tests; mirrors buildSshArgs with interactiveTty so the remote
 *  side allocates a PTY while keeping ControlMaster reuse benefits. */
export function buildInteractiveSshCommand(
  target: SshTarget,
  sshBinary: string
): {
  file: string
  args: string[]
} {
  return { file: sshBinary, args: buildSshArgs(target, { interactiveTty: true }) }
}

function sanitizeEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) {
      continue
    }
    // Why: Electron sets ELECTRON_RUN_AS_NODE for utility processes; leaking it
    // into the ssh client breaks any local program it launches.
    if (key.startsWith('ELECTRON_')) {
      continue
    }
    env[key] = value
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.TERM_PROGRAM = 'Orca'
  return env
}

export function createSshShellSessionService(deps: {
  getTarget: (id: string) => SshTarget | undefined
}): SshShellSessionService {
  const sessions = new Map<string, ShellSession>()
  const dataListeners = new Set<(event: RemoteShellDataEvent) => void>()
  const exitListeners = new Set<(event: RemoteShellExitEvent) => void>()

  const emitData = (event: RemoteShellDataEvent): void => {
    for (const listener of dataListeners) {
      listener(event)
    }
  }
  const emitExit = (event: RemoteShellExitEvent): void => {
    for (const listener of exitListeners) {
      listener(event)
    }
  }

  const removeSession = (shellSessionId: string): void => {
    sessions.delete(shellSessionId)
  }

  return {
    spawn({ targetId, cols, rows }): RemoteShellSpawnResult {
      const target = deps.getTarget(targetId)
      if (!target) {
        return { ok: false, error: `Unknown SSH target: ${targetId}` }
      }
      const sshBinary = findSystemSsh() ?? 'ssh'
      const { file, args } = buildInteractiveSshCommand(target, sshBinary)
      const shellSessionId = `rsh-${randomUUID()}`
      try {
        const shell = pty.spawn(file, args, {
          name: 'xterm-256color',
          cols: Math.min(Math.max(cols ?? 80, 2), 500),
          rows: Math.min(Math.max(rows ?? 24, 2), 200),
          cwd: homedir(),
          env: sanitizeEnv()
        })
        sessions.set(shellSessionId, { pty: shell, targetId })
        shell.onData((chunk: string) => {
          emitData({ shellSessionId, chunkBase64: Buffer.from(chunk, 'utf8').toString('base64') })
        })
        shell.onExit((event: { exitCode: number; signal?: number }) => {
          removeSession(shellSessionId)
          emitExit({
            shellSessionId,
            exitCode: event.exitCode ?? null,
            signal: event.signal !== undefined ? String(event.signal) : undefined
          })
        })
        return { ok: true, shellSessionId }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to spawn ssh session'
        }
      }
    },

    write(shellSessionId, data): boolean {
      const session = sessions.get(shellSessionId)
      if (!session) {
        return false
      }
      session.pty.write(data)
      return true
    },

    resize(shellSessionId, cols, rows): boolean {
      const session = sessions.get(shellSessionId)
      if (!session) {
        return false
      }
      // Why: clamp here too — renderer geometry can race a resize before spawn clamps apply.
      session.pty.resize(
        Math.min(Math.max(Math.floor(cols), 2), 500),
        Math.min(Math.max(Math.floor(rows), 2), 200)
      )
      return true
    },

    kill(shellSessionId): boolean {
      const session = sessions.get(shellSessionId)
      if (!session) {
        return false
      }
      // Why: kill() fires onExit which removes the session; no double-delete needed.
      session.pty.kill()
      return true
    },

    listSessionIds(): string[] {
      return [...sessions.keys()]
    },

    onData(callback) {
      dataListeners.add(callback)
      return () => dataListeners.delete(callback)
    },

    onExit(callback) {
      exitListeners.add(callback)
      return () => exitListeners.delete(callback)
    },

    disposeAll(): void {
      for (const [id, session] of sessions) {
        try {
          session.pty.kill()
        } catch {
          // Session may already be gone; removal below is what matters.
        }
        sessions.delete(id)
      }
    }
  }
}
