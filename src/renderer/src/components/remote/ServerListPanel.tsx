import React, { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Pencil,
  Plus,
  RefreshCw,
  Server as ServerIcon,
  TerminalSquare,
  Trash2,
  Upload
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { SshTarget } from '../../../../shared/ssh-types'
import { AddRemoteHostDialog, type AddRemoteHostMode } from '../sidebar/AddRemoteHostDialog'

type ServerListPanelProps = {
  targets: SshTarget[]
  selectedServerId: string | null
  onSelect: (targetId: string) => void
  onRefresh: () => void
}

/** Left-hand server list for the Remote view. Owned targets are internal
 *  implementation details (on-demand runtimes) and are hidden here. */
export function ServerListPanel({
  targets,
  selectedServerId,
  onSelect,
  onRefresh
}: ServerListPanelProps): React.JSX.Element {
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const [addDialogMode, setAddDialogMode] = useState<AddRemoteHostMode | null>(null)
  const [editingTarget, setEditingTarget] = useState<SshTarget | null>(null)

  const visibleTargets = useMemo(() => targets.filter((t) => t.owner === undefined), [targets])

  const removeTarget = useCallback(
    async (targetId: string, label: string) => {
      try {
        await window.api.ssh.removeTarget({ id: targetId })
        if (selectedServerId === targetId) {
          useAppStore.getState().selectServer(null)
          useAppStore.getState().clearServerShells(targetId)
        }
        toast.success(
          translate('auto.components.remote.ServerListPanel.removed', 'Removed {{name}}', {
            name: label
          })
        )
        onRefresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
      }
    },
    [selectedServerId, onRefresh]
  )

  return (
    <div className="flex h-full min-w-0 flex-col gap-2 border-r border-border/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {translate('auto.components.remote.ServerListPanel.title', 'Servers')}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onRefresh} aria-label="refresh servers">
            <RefreshCw className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAddDialogMode('ssh')}
            aria-label="add server"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {visibleTargets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-muted-foreground">
          <ServerIcon className="size-8 opacity-40" />
          <p className="text-sm">
            {translate(
              'auto.components.remote.ServerListPanel.empty',
              'No servers yet. Add one from your SSH config or manually.'
            )}
          </p>
          <Button variant="outline" size="sm" onClick={() => setAddDialogMode('ssh')}>
            <Plus className="size-4" />
            {translate('auto.components.remote.ServerListPanel.add', 'Add server')}
          </Button>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {visibleTargets.map((target) => {
            const status = sshConnectionStates.get(target.id)?.status ?? 'disconnected'
            const connected = status === 'connected'
            return (
              <li key={target.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(target.id)}
                  aria-current={selectedServerId === target.id ? 'true' : undefined}
                  className={cn(
                    'w-full rounded-md px-2 py-1.5 pr-8 text-left transition-colors',
                    selectedServerId === target.id
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        connected
                          ? 'bg-emerald-500'
                          : status === 'connecting' || status === 'reconnecting'
                            ? 'bg-amber-400 animate-pulse'
                            : status === 'error' ||
                                status === 'auth-failed' ||
                                status === 'reconnection-failed'
                              ? 'bg-red-500'
                              : 'bg-muted-foreground/30'
                      )}
                    />
                    <span className="truncate text-[13px] font-medium">{target.label}</span>
                  </span>
                  <span className="mt-0.5 block truncate pl-4 text-xs text-muted-foreground">
                    {target.username ? `${target.username}@` : ''}
                    {target.configHost || target.host}
                  </span>
                </button>
                <div className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 group-hover:flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    title={translate(
                      'auto.components.remote.ServerListPanel.openTerminal',
                      'Open terminal'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(target.id)
                    }}
                  >
                    <TerminalSquare className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    title={translate('auto.components.remote.ServerListPanel.edit', 'Edit server')}
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingTarget(target)
                      setAddDialogMode('ssh')
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    title={translate(
                      'auto.components.remote.ServerListPanel.forget',
                      'Remove server'
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      void removeTarget(target.id, target.label)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Why: hidden upload affordance keeps M3 sync entry point discoverable but inert until the browser pane lands. */}
      <div className="hidden items-center gap-1 border-t border-border/50 pt-2 text-xs text-muted-foreground">
        <Upload className="size-3.5" />
      </div>

      <AddRemoteHostDialog
        mode={addDialogMode}
        editingTarget={editingTarget}
        onOpenChange={(mode) => {
          setAddDialogMode(mode)
          if (mode === null) {
            setEditingTarget(null)
            // Why: the dialog writes target metadata itself on save; closing is our signal to re-list.
            onRefresh()
          }
        }}
      />
    </div>
  )
}
