/**
 * Shared contract for the in-app Reasonix web server (spawned by main).
 * Mirrors the OpenChamber/Paseo host contract: a child process that serves the
 * Reasonix web UI (coding-agent chat) on a loopback port, isolated home, and
 * scoped to the active worktree.
 */

export type ReasonixWebState = 'stopped' | 'starting' | 'running' | 'errored'

/** Shared webview partition for all Reasonix webviews (persistent storage). */
export const REASONIX_WEBVIEW_PARTITION = 'persist:reasonix-web'

/** Slim projection of one Reasonix session for the in-app list. */
export type ReasonixSessionSummary = {
  sessionId: string
  path: string
  title: string | null
  turns: number
  current: boolean
}

export type ReasonixWebStatus = {
  state: ReasonixWebState
  port: number
  url: string | null
  pid: number | null
  /** The reasonix binary path the server was spawned with. */
  binary: string | null
  /** The workspace directory the server was spawned with. */
  cwd: string | null
  error: string | null
}

/** One project's Reasonix server row for the in-app overview table. */
export type ReasonixProjectStatus = {
  projectPath: string
  port: number
  state: ReasonixWebState
  pid: number | null
  sessionCount: number
  error: string | null
}
