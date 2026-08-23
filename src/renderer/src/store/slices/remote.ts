import type { StateCreator } from 'zustand'
import type { AppState } from '../types'

export type RemoteShellStatus = 'idle' | 'connecting' | 'open' | 'exited'

export type RemoteSlice = {
  selectedServerId: string | null
  /** Which surface fills the right side of the Remote view for the selected server. */
  remoteActiveTab: 'terminal' | 'files'
  shellSessionIdByServer: Record<string, string>
  shellStatusByServer: Record<string, RemoteShellStatus>
  selectServer: (serverId: string | null) => void
  setRemoteActiveTab: (tab: 'terminal' | 'files') => void
  setShellSession: (
    serverId: string,
    shellSessionId: string | null,
    status: RemoteShellStatus
  ) => void
  clearServerShells: (serverId: string) => void
}

export const initialRemoteSliceState = {
  selectedServerId: null,
  remoteActiveTab: 'terminal',
  shellSessionIdByServer: {},
  shellStatusByServer: {}
} satisfies Pick<
  RemoteSlice,
  'selectedServerId' | 'remoteActiveTab' | 'shellSessionIdByServer' | 'shellStatusByServer'
>

export const createRemoteSlice: StateCreator<AppState, [], [], RemoteSlice> = (set) => ({
  ...initialRemoteSliceState,

  selectServer: (serverId) => set({ selectedServerId: serverId }),

  setRemoteActiveTab: (tab) => set({ remoteActiveTab: tab }),

  // Why: one shell per server — respawning replaces the old session id so the pane reattaches cleanly.
  setShellSession: (serverId, shellSessionId, status) =>
    set((state) => ({
      shellSessionIdByServer:
        shellSessionId === null
          ? omitKey(state.shellSessionIdByServer, serverId)
          : { ...state.shellSessionIdByServer, [serverId]: shellSessionId },
      shellStatusByServer: { ...state.shellStatusByServer, [serverId]: status }
    })),

  clearServerShells: (serverId) =>
    set((state) => ({
      shellSessionIdByServer: omitKey(state.shellSessionIdByServer, serverId),
      shellStatusByServer: omitKey(state.shellStatusByServer, serverId)
    }))
})

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) {
    return record
  }
  const next = { ...record }
  delete next[key]
  return next
}
