import { translate } from '@/i18n/i18n'
import type { NotesSyncStatus } from '../../../../shared/notes-sync-types'

// Why: maps a NotesSyncStatus to the IntegrationCardShell presentational props
// (connected flag + status label), keeping the card component readable.

export function integrationCardStatus(
  status: NotesSyncStatus | null,
  checked: boolean
): { connected: boolean; labeled: string } {
  const conn = status?.connection
  if (conn?.state === 'connected') {
    return {
      connected: true,
      labeled: translate('auto.components.settings.turso.status.connected', 'Connected')
    }
  }
  if (conn?.state === 'error') {
    return {
      connected: false,
      labeled: translate('auto.components.settings.turso.status.error', 'Error')
    }
  }
  if (conn?.state === 'connecting') {
    return {
      connected: false,
      labeled: translate('auto.components.settings.turso.status.connecting', 'Connecting…')
    }
  }
  return {
    connected: false,
    labeled: checked
      ? translate('auto.components.settings.turso.status.notConnected', 'Not connected')
      : translate('auto.components.settings.turso.status.checking', 'Checking')
  }
}