import React, { useState, useCallback } from 'react'
import { Monitor, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import {
  ALL_EXECUTION_HOSTS_SCOPE,
  LOCAL_EXECUTION_HOST_ID
} from '../../../../shared/execution-host'
import type { WorkspaceHostScope } from '../../../../shared/types'

type MachineEntry = {
  id: WorkspaceHostScope
  label: string
  detail: string
  status: 'online' | 'offline' | 'connecting' | 'local'
}

function StatusDot({ status }: { status: MachineEntry['status'] }) {
  return (
    <span
      className={cn(
        'inline-block size-1.5 rounded-full shrink-0',
        status === 'online' && 'bg-green-500',
        status === 'connecting' && 'bg-yellow-400 animate-pulse',
        status === 'offline' && 'bg-red-500/60',
        status === 'local' && 'bg-blue-400'
      )}
    />
  )
}

const MachineStatusPanel = React.memo(function MachineStatusPanel() {
  const [collapsed, setCollapsed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const workspaceHostScope = useAppStore((s) => s.workspaceHostScope)
  const setWorkspaceHostScope = useAppStore((s) => s.setWorkspaceHostScope)

  // SSH targets
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)

  // Remote Orca Servers
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const hydrateRuntimeEnvironmentStatuses = useAppStore((s) => s.hydrateRuntimeEnvironmentStatuses)

  const handleReload = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (refreshing) {
        return
      }
      setRefreshing(true)
      try {
        await hydrateRuntimeEnvironmentStatuses()
      } catch {
        // ignore
      } finally {
        setTimeout(() => setRefreshing(false), 1000)
      }
    },
    [refreshing, hydrateRuntimeEnvironmentStatuses]
  )

  const machines: MachineEntry[] = React.useMemo(() => {
    const list: MachineEntry[] = [
      { id: LOCAL_EXECUTION_HOST_ID, label: 'Local', detail: 'localhost', status: 'local' }
    ]

    // SSH targets
    for (const [targetId, label] of sshTargetLabels.entries()) {
      const state = sshConnectionStates.get(targetId)
      const phase = state?.status ?? 'disconnected'
      let status: MachineEntry['status'] = 'offline'
      if (phase === 'connected') {
        status = 'online'
      } else if (phase === 'connecting' || phase === 'reconnecting') {
        status = 'connecting'
      }

      list.push({
        id: `ssh:${encodeURIComponent(targetId)}` as WorkspaceHostScope,
        label,
        detail: targetId,
        status
      })
    }

    // Remote Orca Servers (runtime environments)
    for (const env of runtimeEnvironments) {
      const envStatus = runtimeStatusByEnvironmentId.get(env.id)
      let status: MachineEntry['status'] = 'offline'
      if (envStatus?.status) {
        status = 'online'
      } else if (envStatus === undefined) {
        status = 'connecting'
      }

      const endpoint = env.endpoints[0]?.endpoint ?? ''
      const host = endpoint.replace(/^wss?:\/\//, '').replace(/:\d+$/, '')

      list.push({
        id: `runtime:${env.id}` as WorkspaceHostScope,
        label: env.name,
        detail: host,
        status
      })
    }

    return list
  }, [sshTargetLabels, sshConnectionStates, runtimeEnvironments, runtimeStatusByEnvironmentId])

  const onlineMachines = machines.filter(
    (m) => m.status === 'online' || m.status === 'local' || m.status === 'connecting'
  )
  const offlineCount = machines.filter((m) => m.status === 'offline').length
  const totalCount = machines.length

  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)

  return (
    <div className="px-2 pb-1">
      {/* Header */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-worktree-sidebar-foreground/40 hover:text-worktree-sidebar-foreground/60 transition-colors"
        >
          <Monitor className="size-3 shrink-0" strokeWidth={1.75} />
          <span className="flex-1">Machines</span>
          <span className="text-[10px] font-normal tabular-nums text-worktree-sidebar-foreground/30">
            {onlineMachines.length}/{totalCount}
          </span>
          {collapsed ? (
            <ChevronRight className="size-3 shrink-0" strokeWidth={1.75} />
          ) : (
            <ChevronDown className="size-3 shrink-0" strokeWidth={1.75} />
          )}
        </button>

        {/* Reload button */}
        <button
          type="button"
          onClick={handleReload}
          disabled={refreshing}
          title="Reload machine status"
          className="flex items-center justify-center size-5 rounded-md text-worktree-sidebar-foreground/30 hover:text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn('size-3', refreshing && 'animate-spin')} strokeWidth={1.75} />
        </button>
      </div>

      {/* Machine list — online only */}
      {!collapsed && (
        <div className="mt-0.5 flex flex-col gap-px">
          {/* All */}
          <button
            type="button"
            onClick={() => setWorkspaceHostScope(ALL_EXECUTION_HOSTS_SCOPE)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] font-medium transition-colors',
              workspaceHostScope === ALL_EXECUTION_HOSTS_SCOPE
                ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
                : 'text-worktree-sidebar-foreground/55 hover:bg-worktree-sidebar-foreground/8 hover:text-worktree-sidebar-foreground/80'
            )}
          >
            <span className="inline-block size-1.5 rounded-full shrink-0 bg-worktree-sidebar-foreground/25" />
            <span className="flex-1 truncate">All</span>
          </button>

          {onlineMachines.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setWorkspaceHostScope(m.id)}
              title={m.detail}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] font-medium transition-colors',
                workspaceHostScope === m.id
                  ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
                  : 'text-worktree-sidebar-foreground/55 hover:bg-worktree-sidebar-foreground/8 hover:text-worktree-sidebar-foreground/80'
              )}
            >
              <StatusDot status={m.status} />
              <span className="flex-1 truncate">{m.label}</span>
              {m.status === 'connecting' && (
                <span className="text-[10px] text-yellow-500/70 shrink-0">…</span>
              )}
            </button>
          ))}

          {/* Offline count link to settings */}
          {offlineCount > 0 && (
            <button
              type="button"
              onClick={() => {
                openSettingsPage()
                openSettingsTarget({ pane: 'ssh', repoId: null })
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors text-worktree-sidebar-foreground/30 hover:text-worktree-sidebar-foreground/50 hover:bg-worktree-sidebar-foreground/5"
            >
              <span className="inline-block size-1.5 rounded-full shrink-0 bg-red-500/50" />
              <span className="flex-1">{offlineCount} offline</span>
              <span className="text-[10px] shrink-0">→</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
})

export default MachineStatusPanel
