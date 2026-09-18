import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Radio, RefreshCw, Square } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type {
  LinearRelayGatewayStatus,
  LinearRelayRecentTask
} from '../../../../shared/task-orchestration-types'
import type { LinearWebhookStatus } from '../../../../shared/linear-webhook-types'
import { cn } from '@/lib/utils'

export function LinearGatewayStatusSegment({
  compact,
  iconOnly
}: {
  compact?: boolean
  iconOnly?: boolean
}): React.JSX.Element {
  const [status, setStatus] = useState<LinearRelayGatewayStatus | null>(null)
  const [tasks, setTasks] = useState<LinearRelayRecentTask[]>([])
  const [webhookStatus, setWebhookStatus] = useState<LinearWebhookStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'running' | 'recent'>('running')

  const poll = useCallback(async (): Promise<void> => {
    try {
      const [s, t, w] = await Promise.all([
        window.api.taskOrchestration.getGatewayStatus(),
        window.api.taskOrchestration.listRecentTasks(),
        window.api.linearWebhook.getStatus()
      ])
      setStatus(s)
      setTasks(t)
      setWebhookStatus(w)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void poll()
    timerRef.current = setInterval(() => void poll(), 10_000)
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [poll])

  const refreshNow = async (): Promise<void> => {
    setLoading(true)
    try {
      await poll()
    } finally {
      setLoading(false)
    }
  }

  const stopRunningTask = async (taskId: string, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    e.preventDefault()
    setStoppingTaskId(taskId)
    try {
      const res = await window.api.taskOrchestration.stopTask({ taskId })
      if (!res.ok && res.error) {
        console.warn('Failed to stop task:', res.error)
      }
      await poll()
    } catch (err) {
      console.warn('stopRunningTask failed:', err)
    } finally {
      setStoppingTaskId(null)
    }
  }

  const isHealthy = status?.gatewayRunning && status?.relayOnline && status?.tunnelOnline
  const serviceRunning = webhookStatus?.running ?? false
  const activeTaskCount = tasks.filter(
    (t) => t.status === 'dispatched' || t.status === 'ready'
  ).length

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'inline-flex h-5 items-center gap-1.5 rounded px-1.5 text-[11px] font-medium transition-colors hover:bg-accent/70 focus:outline-none',
                isHealthy ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              <span className="relative flex size-2 items-center justify-center">
                {activeTaskCount > 0 ? (
                  <>
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
                  </>
                ) : isHealthy && serviceRunning ? (
                  <>
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                  </>
                ) : status?.gatewayRunning && serviceRunning ? (
                  <span className="inline-flex size-1.5 rounded-full bg-amber-500" />
                ) : (
                  <span className="inline-flex size-1.5 rounded-full bg-rose-500" />
                )}
              </span>
              <Radio
                className={cn(
                  'size-3 text-muted-foreground',
                  activeTaskCount > 0 && 'animate-pulse text-amber-500'
                )}
              />
              {!iconOnly && (
                <span className={cn('truncate', compact ? 'hidden md:inline' : '')}>
                  {activeTaskCount > 0 ? `Linear (${activeTaskCount} running)` : 'Linear Relay'}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          Linear Webhook Relay & Task Gateway
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-80 p-2 text-xs">
        <div className="flex items-center justify-between pb-1.5">
          <DropdownMenuLabel className="p-0 font-semibold text-foreground">
            Linear Relay Gateway
          </DropdownMenuLabel>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              void refreshNow()
            }}
            disabled={loading}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5 py-1 text-center">
          <div className="rounded border border-border/60 bg-muted/40 p-1.5">
            <div className="text-[10px] text-muted-foreground">Service</div>
            <div
              className={cn('font-medium', serviceRunning ? 'text-emerald-500' : 'text-rose-500')}
            >
              {serviceRunning ? 'Native' : 'Stopped'}
            </div>
          </div>
          <div className="rounded border border-border/60 bg-muted/40 p-1.5">
            <div className="text-[10px] text-muted-foreground">Local Gateway</div>
            <div
              className={cn(
                'font-medium',
                status?.gatewayRunning ? 'text-emerald-500' : 'text-rose-500'
              )}
            >
              {status?.gatewayRunning ? ':18789 OK' : 'Down'}
            </div>
          </div>
          <div className="rounded border border-border/60 bg-muted/40 p-1.5">
            <div className="text-[10px] text-muted-foreground">CF Tunnel</div>
            <div
              className={cn(
                'font-medium',
                status?.tunnelOnline ? 'text-emerald-500' : 'text-rose-500'
              )}
            >
              {status?.tunnelOnline ? 'Connected' : 'Offline'}
            </div>
          </div>
          <div className="rounded border border-border/60 bg-muted/40 p-1.5">
            <div className="text-[10px] text-muted-foreground">CF Worker</div>
            <div
              className={cn(
                'font-medium',
                status?.relayOnline ? 'text-emerald-500' : 'text-rose-500'
              )}
            >
              {status?.relayOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>

        <DropdownMenuSeparator className="my-1.5" />

        <div className="flex items-center justify-between px-1 py-0.5">
          <div className="flex items-center gap-1 rounded bg-muted/60 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setActiveTab('running')
              }}
              className={cn(
                'rounded px-2 py-0.5 font-medium transition-colors',
                activeTab === 'running'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Running {activeTaskCount > 0 && `(${activeTaskCount})`}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setActiveTab('recent')
              }}
              className={cn(
                'rounded px-2 py-0.5 font-medium transition-colors',
                activeTab === 'recent'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Recent ({tasks.length})
            </button>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {activeTab === 'running' ? `${activeTaskCount} active` : `${tasks.length} total`}
          </span>
        </div>

        <div className="max-h-56 space-y-1 overflow-y-auto pt-1">
          {(() => {
            const displayedTasks =
              activeTab === 'running'
                ? tasks.filter((t) => t.status === 'dispatched' || t.status === 'ready')
                : tasks

            if (displayedTasks.length === 0) {
              return (
                <div className="py-4 text-center text-[11px] text-muted-foreground">
                  {activeTab === 'running'
                    ? 'Tidak ada task yang sedang running'
                    : 'Belum ada task dari Linear'}
                </div>
              )
            }

            return displayedTasks.map((task) => (
              <DropdownMenuItem
                key={task.id}
                className="flex cursor-default flex-col items-start gap-1 rounded p-1.5 text-xs hover:bg-accent/60"
                onSelect={(e) => e.preventDefault()}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="truncate font-medium text-foreground">{task.title}</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold capitalize',
                      task.status === 'completed'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : task.status === 'dispatched' || task.status === 'ready'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse'
                          : task.status === 'failed'
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                            : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {(task.status === 'dispatched' || task.status === 'ready') && (
                      <span className="size-1.5 rounded-full bg-amber-500 animate-ping" />
                    )}
                    {task.status === 'dispatched' ? 'running' : task.status}
                  </span>
                </div>
                <div className="flex w-full items-center justify-between text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono">{task.id}</span>
                    {(task.status === 'dispatched' || task.status === 'ready') && (
                      <button
                        type="button"
                        onClick={(e) => void stopRunningTask(task.id, e)}
                        disabled={stoppingTaskId === task.id}
                        className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-medium text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
                        title="Stop task execution"
                      >
                        <Square className="size-2 fill-current" />
                        <span>{stoppingTaskId === task.id ? 'Stopping...' : 'Stop'}</span>
                      </button>
                    )}
                  </div>
                  <span>
                    {task.createdAt
                      ? new Date(task.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : ''}
                  </span>
                </div>
              </DropdownMenuItem>
            ))
          })()}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
