/**
 * Cloudflare Relay IPC handlers — wires CloudflareRelayService into main
 * and exposes status/restart to the renderer via mobile:* IPC channel.
 *
 * Initialization is deferred until firstWindowStartupServicesReady resolves
 * so that state.store is populated before we read settings.
 */
import { ipcMain } from 'electron'
import { mainProcessState as state } from '../../../main/startup/main-process-state'
import { getCanonicalUserDataPath } from '../../../main/persistence/loading-store/user-data-path'
import { CloudflareRelayService } from './runtime/cloudflare-relay/cloudflare-relay'
import type { CloudflareRelayStatusPayload } from '../../../shared/cloudflare-relay-status'

let relay: CloudflareRelayService | null = null

function buildPayload(): CloudflareRelayStatusPayload {
  const settings = state.store?.getSettings()
  const configured = Boolean(settings?.cloudflareRelayToken && settings?.cloudflareRelayDomain)
  if (!relay) {
    return { configured, state: 'disabled', hostname: '', wsPort: null }
  }
  const status = relay.getStatus()
  return {
    configured,
    state: status.state,
    hostname: status.state === 'running' ? status.hostname : '',
    message: status.state === 'error' ? status.message : undefined,
    wsPort: relay.getWsPortValue()
  }
}

export function registerCloudflareRelayHandlers(): void {
  ipcMain.removeHandler('mobile:getCloudflareRelayStatus')
  ipcMain.removeHandler('mobile:restartCloudflareRelay')
  ipcMain.removeHandler('mobile:setCloudflareRelay')

  ipcMain.handle('mobile:getCloudflareRelayStatus', (): CloudflareRelayStatusPayload =>
    buildPayload()
  )

  ipcMain.handle(
    'mobile:restartCloudflareRelay',
    async (): Promise<{ ok: boolean; error?: string }> => {
      if (!relay) {
        return { ok: false, error: 'cloudflare_relay_unavailable' }
      }
      return relay.restart()
    }
  )

  ipcMain.handle(
    'mobile:setCloudflareRelay',
    async (
      _event: Electron.IpcMainInvokeEvent,
      enabled: boolean
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!enabled) {
        // Disable path — if the relay is already null, just persist the setting.
        if (relay) {
          return relay.setEnabled(false)
        }
        const store = state.store
        if (store) {
          store.updateSettings({ cloudflareRelayEnabled: false })
        }
        return { ok: true }
      }
      // Enable path — construct the relay on demand when it hasn't been
      // initialised yet (token/domain were saved without an active relay).
      const store = state.store
      if (!store) {
        return { ok: false, error: 'Store not available yet — try again after startup.' }
      }
      if (!relay) {
        relay = new CloudflareRelayService({
          store,
          userDataPath: getCanonicalUserDataPath()
        })
      }
      return relay.setEnabled(true)
    }
  )

  // Wait until the main store is loaded (set during firstWindowStartupServicesReady),
  // then initialise the relay service if token + domain are configured.
  void state.firstWindowStartupServicesReady.then(() => {
    const store = state.store
    if (!store) {
      console.warn('[cloudflare-relay] store not available after startup, skipping relay init')
      return
    }
    const settings = store.getSettings()
    if (!settings?.cloudflareRelayToken || !settings?.cloudflareRelayDomain) {
      // Not configured — stay dormant, segment will be hidden.
      return
    }
    relay = new CloudflareRelayService({
      store,
      userDataPath: getCanonicalUserDataPath()
    })
    // WS port discovery: poll until the runtime WebSocket is bound.
    const tryStart = (): void => {
      const endpoint = state.runtimeRpc?.getWebSocketEndpoint?.()
      const match = endpoint ? /:\d+$/.exec(endpoint) : null
      const port = match ? Number(match[0].slice(1)) : null
      if (port !== null) {
        void relay?.start(port)
      } else {
        setTimeout(tryStart, 1_000)
      }
    }
    tryStart()
  })
}
