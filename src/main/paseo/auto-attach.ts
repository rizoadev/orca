/**
 * Keeps Paseo's project list in sync with Orca's active worktree. Sends
 * open_project_request to the daemon WebSocket whenever the active worktree
 * path changes (or on startup), so the in-app Paseo web chat is always
 * attached to the project the user is looking at.
 */
import WebSocket from 'ws'
import { stripFolderWorkspaceInstanceSuffix } from '../../shared/worktree-id'
import type { PaseoDaemonManager } from './daemon-manager'
import type { PaseoProjectStatus } from '../../shared/paseo-types'

type OpenProjectResponse = {
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
    | { type: 'open_project_response'; payload?: OpenProjectResponse }
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
// Why: attaching every Orca project up front must not hammer the daemon's WS;
// a small worker pool keeps the creates serialized enough to stay reliable.
const ATTACH_CONCURRENCY = 5
// Why: the daemon keys reconnectable sessions by clientId, so Date.now()
// alone collides when concurrent attaches run in the same millisecond — a
// monotonic suffix keeps every WS connection a distinct session.
let attachSequence = 0

/** Normalize a caller-provided path to the real directory Paseo should open. */
function normalizeAttachPath(path: string): string {
  // Why: folder-workspace instance paths can carry a ::workspace:<uuid>
  // suffix; the daemon would reject the virtual path as directory_not_found.
  return stripFolderWorkspaceInstanceSuffix(path.trim())
}

export class PaseoAutoAttach {
  private lastAttachedPath: string | null = null
  private lastResult: PaseoAttachResult = { workspaceId: null, serverId: null }
  // Why: per-path in-flight promises make concurrent attaches for the same
  // directory atomic — a second caller awaits the first and shares its result
  // instead of racing the daemon's find-or-create.
  private attachInFlightByPath = new Map<string, Promise<PaseoAttachResult>>()
  private daemon: PaseoDaemonManager
  // Why: the daemon dedupes by cwd (open_project reuses an active workspace),
  // so this cache only skips a redundant WS round trip per path.
  private workspaceByPath = new Map<string, PaseoAttachResult>()

  constructor(daemon: PaseoDaemonManager) {
    this.daemon = daemon
  }

  /** Attach a worktree path to Paseo; no-op when already attached to it. */
  async attachWorktree(worktreePath: string | null): Promise<PaseoAttachResult> {
    if (!worktreePath) {
      return { workspaceId: null, serverId: null }
    }
    const normalized = normalizeAttachPath(worktreePath)
    if (!normalized) {
      return { workspaceId: null, serverId: null }
    }
    const cached = this.workspaceByPath.get(normalized)
    if (cached?.workspaceId) {
      return cached
    }
    // Why: serialize per directory, not globally — a single in-flight promise
    // makes every concurrent waiter burst through once it settles, so two
    // calls for the same path can still race the daemon's find-or-create.
    const inFlight = this.attachInFlightByPath.get(normalized)
    if (inFlight) {
      return inFlight
    }
    if (normalized === this.lastAttachedPath) {
      // Why: callers (worktree-follow) still need the workspace id to navigate
      // a restored Paseo tab even when the path was already attached.
      return this.lastResult
    }
    if (!this.daemon.isRunning()) {
      // Why: the webview can't reach the daemon yet; record intent so a later
      // explicit attach call (view focus / worktree switch) still sends it.
      this.lastAttachedPath = normalized
      return { workspaceId: null, serverId: null }
    }
    const promise = this.doAttach(normalized).then((result) => {
      this.lastAttachedPath = normalized
      this.lastResult = result
      if (result.workspaceId) {
        this.workspaceByPath.set(normalized, result)
      }
      console.info(
        `[paseo] attached path=${normalized} workspace=${result.workspaceId} server=${result.serverId}`
      )
      return result
    })
    this.attachInFlightByPath.set(normalized, promise)
    try {
      return await promise
    } finally {
      this.attachInFlightByPath.delete(normalized)
    }
  }

  /**
   * Attach every Orca worktree up front so each project has a workspace ready
   * in the daemon — mirrors the OpenChamber per-project allocation pattern.
   * Idempotent: already-attached paths resolve from the in-process cache.
   */
  async attachAllWorktrees(worktreePaths: string[]): Promise<PaseoProjectStatus[]> {
    // Why: several worktree entries can share one directory (folder-workspace
    // instances); dedupe so a path is attached exactly once per pass.
    const queue = Array.from(new Set(worktreePaths.map(normalizeAttachPath).filter(Boolean)))
    const results: PaseoProjectStatus[] = []
    const workers = Array.from(
      { length: Math.min(ATTACH_CONCURRENCY, Math.max(queue.length, 1)) },
      async () => {
        while (queue.length > 0) {
          const path = queue.shift()
          if (!path) {
            return
          }
          try {
            const result = await this.attachWorktree(path)
            results.push({
              projectPath: path,
              workspaceId: result.workspaceId,
              serverId: result.serverId,
              attached: Boolean(result.workspaceId)
            })
          } catch {
            results.push({ projectPath: path, workspaceId: null, serverId: null, attached: false })
          }
        }
      }
    )
    await Promise.all(workers)
    return results
  }

  private async doAttach(worktreePath: string): Promise<PaseoAttachResult> {
    const url = `ws://127.0.0.1:${portOf(this.daemon)}${WS_PATH}`
    const stamp = Date.now()
    const seq = attachSequence++
    // Why: unique ids keep the daemon from resuming a stale session (it keys
    // reconnectable sessions by clientId) and let us correlate responses; the
    // sequence breaks the same-millisecond collision between parallel attaches.
    const clientId = `orca-${stamp}-${seq}`
    const openProjectRequestId = `orca-open-project-${stamp}-${seq}`
    let ws: WebSocket | null = null
    const send = (message: Record<string, unknown>): void => {
      ws?.send(JSON.stringify({ type: 'session', message }))
    }

    return await new Promise<PaseoAttachResult>((resolve) => {
      let settled = false
      let serverId: string | null = null
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
          `[paseo] ws msg=${message.type} req=${(message as { payload?: { requestId?: string } }).payload?.requestId ?? 'none'}`
        )
        // Why: business messages only flow after the daemon's server_info
        // greeting; a same-beat request is silently dropped, so wait a beat.
        if (message.type === 'status') {
          if (message.payload?.status === 'server_info') {
            serverId = message.payload.serverId ?? null
            setTimeout(() => {
              if (!settled) {
                // Why: open_project is the daemon's idempotent attach — it
                // finds/creates the project and reuses an active workspace for
                // the cwd (unarchiving an archived one) instead of creating a
                // duplicate workspace per attach. workspace.create would be
                // wrong here: it always makes a fresh workspace.
                send({
                  type: 'open_project_request',
                  cwd: worktreePath,
                  requestId: openProjectRequestId
                })
              }
            }, ATTACH_DELAY_MS)
          }
          return
        }
        if (
          message.type === 'open_project_response' &&
          message.payload?.requestId === openProjectRequestId
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
