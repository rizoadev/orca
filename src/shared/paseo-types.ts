/** Shared contract for the in-app Paseo daemon (spawned by the main process). */

export type PaseoDaemonState = 'stopped' | 'starting' | 'running' | 'errored'

export type PaseoDaemonStatus = {
  state: PaseoDaemonState
  port: number
  url: string | null
  pid: number | null
  error: string | null
}

/** One project's Paseo workspace row for the in-app overview table. */
export type PaseoProjectStatus = {
  projectPath: string
  workspaceId: string | null
  serverId: string | null
  attached: boolean
}
