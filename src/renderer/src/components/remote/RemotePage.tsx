import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { SshTarget } from '../../../../shared/ssh-types'
import { ServerListPanel } from './ServerListPanel'
import { RemoteShellPane } from './RemoteShellPane'
import { RemoteFilesPane } from './RemoteFilesPane'
import { cn } from '@/lib/utils'

/** Top-level 'remote' view: server list on the left, terminal or file browser on the right. */
export function RemotePage(): React.JSX.Element {
  const selectedServerId = useAppStore((s) => s.selectedServerId)
  const remoteActiveTab = useAppStore((s) => s.remoteActiveTab)
  const setRemoteActiveTab = useAppStore((s) => s.setRemoteActiveTab)
  const [splitTerminalOpen, setSplitTerminalOpen] = useState(false)
  const [cdRequest, setCdRequest] = useState<{ path: string; nonce: number } | null>(null)
  const cdNonceRef = useRef(0)
  const selectServer = useAppStore((s) => s.selectServer)
  const clearServerShells = useAppStore((s) => s.clearServerShells)
  const [targets, setTargets] = useState<SshTarget[]>([])

  const refresh = useCallback(() => {
    void window.api.ssh
      .listTargets()
      .then(setTargets)
      .catch(() => setTargets([]))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Why: drop selection if its target disappears (removed elsewhere, e.g. Settings).
  useEffect(() => {
    if (selectedServerId !== null && !targets.some((t) => t.id === selectedServerId)) {
      if (selectedServerId) {
        clearServerShells(selectedServerId)
      }
      selectServer(null)
    }
  }, [targets, selectedServerId, selectServer, clearServerShells])

  const selectedTarget = targets.find((t) => t.id === selectedServerId) ?? null

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-64 shrink-0">
        <ServerListPanel
          targets={targets}
          selectedServerId={selectedServerId}
          onSelect={(id) => selectServer(id)}
          onRefresh={refresh}
        />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        {selectedTarget ? (
          <>
            <div className="flex items-center gap-1 border-b border-border/50 px-3 py-1.5">
              {(['terminal', 'files'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setRemoteActiveTab(tab)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    remoteActiveTab === tab
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  {tab === 'terminal'
                    ? translate('auto.components.remote.RemotePage.tabTerminal', 'Terminal')
                    : translate('auto.components.remote.RemotePage.tabFiles', 'Files')}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              {remoteActiveTab === 'files' ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="min-h-0 flex-1">
                    <RemoteFilesPane
                      key={`${selectedTarget.id}-files`}
                      targetId={selectedTarget.id}
                      onOpenTerminalHere={(dirPath) => {
                        cdNonceRef.current += 1
                        setCdRequest({ path: dirPath, nonce: cdNonceRef.current })
                        setSplitTerminalOpen(true)
                      }}
                    />
                  </div>
                  {splitTerminalOpen ? (
                    <div className="h-[38%] min-h-0 shrink-0 border-t border-border/50">
                      <RemoteShellPane
                        key={`${selectedTarget.id}-split`}
                        target={selectedTarget}
                        cdRequest={cdRequest}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <RemoteShellPane key={selectedTarget.id} target={selectedTarget} />
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-muted-foreground">
            <p className="max-w-sm text-sm">
              {translate(
                'auto.components.remote.RemotePage.pickServer',
                'Select a server on the left to open an SSH terminal.'
              )}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
