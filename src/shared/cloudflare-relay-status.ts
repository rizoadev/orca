export type CloudflareRelayStatusState = 'disabled' | 'provisioning' | 'running' | 'error'

export type CloudflareRelayStatusPayload = {
  configured: boolean
  state: CloudflareRelayStatusState
  hostname: string
  message?: string
  wsPort: number | null
}
