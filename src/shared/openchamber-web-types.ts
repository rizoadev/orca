/**
 * Shared contract for the in-app OpenChamber web server (spawned by main).
 * Mirrors the DeepSeek/Paseo host contract: a child process that serves a web
 * UI on a loopback port, isolated home, and scoped to the active worktree.
 */

export type OpenChamberWebState = 'stopped' | 'starting' | 'running' | 'errored'

/** Slim projection of one OpenChamber session for the in-app list. */
export type OpenChamberSessionSummary = {
  sessionId: string
  directory: string
  title: string | null
  updatedAt: number
}

export type OpenChamberWebStatus = {
  state: OpenChamberWebState
  port: number
  url: string | null
  pid: number | null
  /** The OpenCode binary path the server was spawned with, when resolved. */
  opencodeBinary: string | null
  /** The workspace directory the web server was spawned with. */
  cwd: string | null
  error: string | null
}
