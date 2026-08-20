/** Shared contract for the in-app Paseo daemon (spawned by the main process). */

export type PaseoDaemonState = 'stopped' | 'starting' | 'running' | 'errored'

export type PaseoDaemonStatus = {
  state: PaseoDaemonState
  port: number
  url: string | null
  pid: number | null
  error: string | null
}
