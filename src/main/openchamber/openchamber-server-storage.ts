/**
 * Storage wiping for OpenChamber webviews, kept out of the manager for its
 * line budget. All OpenChamber webviews share one partition, but storage is
 * keyed by origin — the project's loopback port — so clearing by origin
 * touches only that project (including its `lastDirectory` pin, which the pin
 * machinery re-writes on the next load).
 */
import { session } from 'electron'
import { OPENCHAMBER_WEBVIEW_PARTITION } from '../../shared/openchamber-web-types'

export function clearProjectStorage(origin: string): Promise<void> {
  return session.fromPartition(OPENCHAMBER_WEBVIEW_PARTITION).clearStorageData({
    origin,
    storages: ['localstorage', 'cookies']
  })
}
