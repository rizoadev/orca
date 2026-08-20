/** Shared contract for the in-app DeepSeek Harness web host (spawned by main). */

export type DeepSeekWebState = 'stopped' | 'starting' | 'running' | 'errored'

/** An agent preset (system or user-authored) exposed by the running web host. */
export type DeepSeekAgentPreset = {
  id: string
  name: string
  description: string
  isDefault: boolean
}

/** Slim projection of one host session for the in-app session list. */
export type DeepSeekSessionSummary = {
  sessionId: string
  cwd: string
  running: boolean
  blank: boolean
  agentPreset: string | null
  title: string | null
  updatedAt: number
}

export type DeepSeekWebStatus = {
  state: DeepSeekWebState
  port: number
  url: string | null
  pid: number | null
  /** The workspace directory the web host was spawned with. */
  cwd: string | null
  error: string | null
}
