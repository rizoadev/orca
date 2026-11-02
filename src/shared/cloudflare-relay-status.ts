// Cloudflare Relay status types — shared between main process and renderer.
// Custom module: src/custom-modules/cloudflare/
// Why in shared/: preload/api/mobile-api.ts imports from here so the type
// is available in the renderer without crossing the custom-modules boundary.

export type CloudflareRelayStatusState = 'disabled' | 'provisioning' | 'running' | 'error'

export type CloudflareRelayStatusPayload = {
  configured: boolean
  state: CloudflareRelayStatusState
  hostname: string
  message?: string
  wsPort: number | null
}
