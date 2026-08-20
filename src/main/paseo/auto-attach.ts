/**
 * Keeps Paseo's project list in sync with Orca's active worktree. Sends
 * project.add.request to the daemon WebSocket whenever the active worktree
 * path changes (or on startup), so the in-app Paseo web chat is always
 * attached to the project the user is looking at.
 */
import WebSocket from 'ws'
import type { PaseoDaemonManager } from './daemon-manager'

type ProjectAddResponse = {
  requestId?: string
  project?: { projectId?: string } | null
  error?: string | null
}

type WorkspaceCreateResponse = {
  requestId?: string
  workspace?: { id?: string } | null
  error?: string | null
}

type ServerInfoPayload = {
  status?: string
  serverId?: string
}

type SessionEnvelope = {
  type: 'session'
  message:
    | { type: 'status'; payload?: ServerInfoPayload }
    | { type: 'project.add.response'; payload?: ProjectAddResponse }
    | { type: 'workspace.create.response'; payload?: WorkspaceCreateResponse }
}

export type PaseoAttachResult = {
  workspaceId: string | null
  serverId: string | null
}

const WS_PATH = '/ws'
const WS_PROTOCOL_VERSION = 1
const REQUEST_TIMEOUT_MS = 10_000
// Why: the daemon silently drops a session request sent in the same beat as
// its server_info greeting; a short beat keeps the attach reliable.
const ATTACH_DELAY_MS = 300

export class PaseoAutoAttach {
  private lastAttachedPath: string | null = null
  private lastResult: PaseoAttachResult = { workspaceId: null, serverId: null }
  private attachInFlight: Promise<PaseoAttachResult> | null = null
  private daemon: PaseoDaemonManager
  // Why: the daemon drops the request after fetch_workspaces, so we can't list
  // to reuse. Cache path→workspace in-process instead; a fresh create always
  // returns a valid workspace id.
  private workspaceByPath = new Map<string, PaseoAttachResult>()

  constructor(daemon: PaseoDaemonManager) {
    this.daemon = daemon
  }

  /** Attach a worktree path to Paseo; no-op when already attached to it. */
  async attachWorktree(worktreePath: string | null): Promise<PaseoAttachResult> {
    if (!worktreePath) {
      return { workspaceId: null, serverId: null }
    }
    const cached = this.workspaceByPath.get(worktreePath)
    if (cached?.workspaceId) {
      return cached
    }
    if (worktreePath === this.lastAttachedPath) {
      // Why: callers (worktree-follow) still need the workspace id to navigate
      // a restored Paseo tab even when the path was already attached.
      return this.lastResult
    }
    if (!this.daemon.isRunning()) {
      // Why: the webview can't reach the daemon yet; record intent so a later
      // explicit attach call (view focus / worktree switch) still sends it.
      this.lastAttachedPath = worktreePath
      return { workspaceId: null, serverId: null }
    }
    // Why: serialize concurrent attaches (open tab + worktree-follow can fire
    // together) so two parallel runs don't create duplicate workspaces for the
    // same path; the second caller re-checks after the first settles.
    if (this.attachInFlight) {
      await this.attachInFlight.catch(() => undefined)
      if (worktreePath === this.lastAttachedPath) {
        return this.lastResult
      }
    }
    this.attachInFlight = this.doAttach(worktreePath).then((result) => {
      this.lastAttachedPath = worktreePath
      this.lastResult = result
      if (result.workspaceId) {
        this.workspaceByPath.set(worktreePath, result)
      }
      console.info(
        `[paseo] attached path=${worktreePath} workspace=${result.workspaceId} server=${result.serverId}`
      )
      return result
    })
    try {
      return await this.attachInFlight
    } finally {
      this.attachInFlight = null
    }
  }

  private async doAttach(worktreePath: string): Promise<PaseoAttachResult> {
    const url = `ws://127.0.0.1:${portOf(this.daemon)}${WS_PATH}`
    const stamp = Date.now()
    // Why: unique ids keep the daemon from resuming a stale session (it keys
    // reconnectable sessions by clientId) and let us correlate responses.
    const clientId = `orca-${stamp}`
    const projectRequestId = `orca-project-${stamp}`
    const workspaceRequestId = `orca-workspace-${stamp}`
    let ws: WebSocket | null = null
    const send = (message: Record<string, unknown>): void => {
      ws?.send(JSON.stringify({ type: 'session', message }))
    }

    return await new Promise<PaseoAttachResult>((resolve) => {
      let settled = false
      let serverId: string | null = null
      let attachedProjectId: string | null = null
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          ws?.close()
          // Why: a timeout is non-fatal — the webview still shows the project
          // via manual add; do not fail the whole view.
          resolve({ workspaceId: null, serverId })
        }
      }, REQUEST_TIMEOUT_MS)
      const settle = (workspaceId: string | null): void => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        ws?.close()
        resolve({ workspaceId, serverId })
      }
      const fail = (error: string): void => {
        if (settled) {
          return
        }
        // Why: attach failures must not break the Paseo view; log and move on.
        console.warn(`[paseo] attach failed path=${worktreePath} error=${error}`)
        settle(null)
      }

      ws = new WebSocket(url)
      ws.once('open', () => {
        ws?.send(
          JSON.stringify({
            type: 'hello',
            clientId,
            clientType: 'browser',
            protocolVersion: WS_PROTOCOL_VERSION
          })
        )
      })
      ws.on('message', (data: Buffer) => {
        if (settled) {
          return
        }
        let envelope: SessionEnvelope | null
        try {
          envelope = JSON.parse(data.toString()) as SessionEnvelope
        } catch {
          return
        }
        if (envelope.type !== 'session') {
          return
        }
        const message = envelope.message
        console.info(
          `[paseo] ws msg=${message.type} req=${(message as { payload?: { requestId?: string } }).payload?.requestId ?? 'none'} wks=${workspaceRequestId}`
        )
        // Why: business messages only flow after the daemon's server_info
        // greeting; a same-beat request is silently dropped, so wait a beat.
        if (message.type === 'status') {
          if (message.payload?.status === 'server_info') {
            serverId = message.payload.serverId ?? null
            setTimeout(() => {
              if (!settled) {
                send({
                  type: 'project.add.request',
                  cwd: worktreePath,
                  requestId: projectRequestId
                })
              }
            }, ATTACH_DELAY_MS)
          }
          return
        }
        if (
          message.type === 'project.add.response' &&
          message.payload?.requestId === projectRequestId
        ) {
          if (message.payload.error) {
            fail(message.payload.error)
            return
          }
          attachedProjectId = message.payload.project?.projectId ?? null
          // Why: a bare project has no active workspace; create one so the web
          // UI shows the folder (file manager) instead of "Workspace unavailable".
          // NOTE: do NOT list workspaces here — the daemon drops the request
          // that follows fetch_workspaces; in-process cache handles reuse.
          send({
            type: 'workspace.create.request',
            requestId: workspaceRequestId,
            source: {
              kind: 'directory',
              path: worktreePath,
              ...(attachedProjectId ? { projectId: attachedProjectId } : {})
            }
          })
          return
        }
        if (
          message.type === 'workspace.create.response' &&
          message.payload?.requestId === workspaceRequestId
        ) {
          if (message.payload.error) {
            fail(message.payload.error)
          } else {
            settle(message.payload.workspace?.id ?? null)
          }
        }
      })
      ws.once('error', (err) => {
        if (!settled) {
          clearTimeout(timer)
          fail(err.message)
        }
      })
      ws.once('close', () => settle(null))
    })
  }

  getLastAttachedPath(): string | null {
    return this.lastAttachedPath
  }

  /** Drop cached path so the next attach call re-sends even for the same path. */
  reset(): void {
    this.lastAttachedPath = null
  }
}

function portOf(daemon: PaseoDaemonManager): number {
  return daemon.getStatus().port
}
