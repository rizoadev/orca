import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Boxes, CheckCircle2, Loader2, PauseCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import type {
  DockerContainerActionRequest,
  DockerListResult
} from '../../../../shared/docker-types'
import { DockerHostSection } from './docker-host-section'

// Why: keep the list live without spamming docker ps; 10s balances freshness with daemon load.
const DOCKER_REFRESH_INTERVAL_MS = 10_000

function runContainerAction(
  request: DockerContainerActionRequest,
  action: 'start' | 'stop' | 'restart' | 'remove'
): Promise<{ ok: boolean; reason?: string }> {
  switch (action) {
    case 'start':
      return window.api.docker.startContainer(request)
    case 'stop':
      return window.api.docker.stopContainer(request)
    case 'restart':
      return window.api.docker.restartContainer(request)
    case 'remove':
      return window.api.docker.removeContainer(request)
  }
}

export default function DockerContainersPage(): React.JSX.Element {
  const [result, setResult] = useState<DockerListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [includeStopped, setIncludeStopped] = useState(false)
  const [busyContainerIds, setBusyContainerIds] = useState<ReadonlySet<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const generationRef = useRef(0)
  const includeStoppedRef = useRef(false)
  includeStoppedRef.current = includeStopped

  const refresh = useCallback(
    async (options: { force?: boolean } = {}): Promise<void> => {
      const generation = generationRef.current
      void options.force
      setRefreshing(true)
      try {
        const next = await window.api.docker.listContainers(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { includeStopped: includeStoppedRef.current } as any
        )
        if (generation === generationRef.current) {
          setResult(next)
          setLoading(false)
        }
      } catch (error) {
        if (generation === generationRef.current) {
          setResult(null)
          setLoading(false)
          toast.error(
            translate('auto.components.docker.loadError', 'Failed to list Docker containers'),
            { description: error instanceof Error ? error.message : String(error) }
          )
        }
      } finally {
        if (generation === generationRef.current) {
          setRefreshing(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    generationRef.current += 1
    setLoading(true)
    void refresh({ force: true })
    const timer = window.setInterval(() => {
      void refresh()
    }, DOCKER_REFRESH_INTERVAL_MS)
    return () => {
      generationRef.current += 1
      window.clearInterval(timer)
    }
  }, [refresh])

  const hosts = useMemo(() => result?.results ?? [], [result])
  const totalRunning = useMemo(
    () =>
      hosts.reduce(
        (sum, host) =>
          sum + host.containers.filter((container) => container.state === 'running').length,
        0
      ),
    [hosts]
  )

  const handleAction = useCallback(
    async (
      request: DockerContainerActionRequest,
      action: 'start' | 'stop' | 'restart' | 'remove'
    ): Promise<void> => {
      setBusyContainerIds((prev) => new Set(prev).add(request.containerId))
      try {
        const outcome = await runContainerAction(request, action)
        if (!outcome.ok) {
          toast.error(
            translate('auto.components.docker.actionFailed', 'Docker action failed'),
            { description: outcome.reason }
          )
        } else {
          toast.success(
            translate('auto.components.docker.actionDone', 'Container {{value0}}', {
              value0: action
            })
          )
        }
      } finally {
        setBusyContainerIds((prev) => {
          const next = new Set(prev)
          next.delete(request.containerId)
          return next
        })
        void refresh({ force: true })
      }
    },
    [refresh]
  )

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center gap-3">
        <Boxes className="size-5 text-foreground" aria-hidden />
        <h1 className="text-[16px] font-semibold tracking-tight text-foreground">
          {translate('auto.components.docker.title', 'Docker Containers')}
        </h1>
        <span className="text-[12px] text-muted-foreground">
          {loading
            ? translate('auto.components.docker.loading', 'Loading…')
            : translate('auto.components.docker.runningCount', '{{value0}} running', {
                value0: String(totalRunning)
              })}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  includeStopped && 'border-primary/60 bg-primary/10 text-primary'
                )}
                onClick={() => setIncludeStopped((v) => !v)}
              >
                <PauseCircle className="size-3.5" aria-hidden />
                {translate('auto.components.docker.includeStopped', 'Include stopped')}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {translate(
                'auto.components.docker.includeStoppedHint',
                'Show exited and created containers too.'
              )}
            </TooltipContent>
          </Tooltip>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh({ force: true })}
            disabled={refreshing}
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} aria-hidden />
            {translate('auto.components.docker.refresh', 'Refresh')}
          </Button>
        </div>
      </div>

      {loading && !result ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          {translate('auto.components.docker.loading', 'Loading…')}
        </div>
      ) : null}

      {!loading && !result ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          {translate(
            'auto.components.docker.unavailable',
            'Docker is unavailable. Check that the Docker daemon is running.'
          )}
        </div>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-6">
          {hosts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
              <CheckCircle2 className="size-8 text-muted-foreground/40" aria-hidden />
              <p className="text-[13px]">
                {translate(
                  'auto.components.docker.noHosts',
                  'No Docker hosts configured. Add an SSH host in Settings to scan remote servers.'
                )}
              </p>
            </div>
          ) : (
            hosts.map((host) => (
              <DockerHostSection
                key={host.hostId}
                host={host}
                busyContainerIds={busyContainerIds}
                onAction={handleAction}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
