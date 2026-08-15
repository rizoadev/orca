import React from 'react'
import { Boxes, CircleStop, Loader2, Play, RotateCw, Server, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type {
  DockerContainer,
  DockerContainerActionRequest,
  DockerHostResult
} from '../../../../shared/docker-types'

const STATE_STYLES: Record<string, string> = {
  running: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  paused: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  restarting: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  exited: 'bg-neutral-500/15 text-neutral-500 dark:text-neutral-400',
  created: 'bg-neutral-500/15 text-neutral-500 dark:text-neutral-400',
  dead: 'bg-red-500/15 text-red-600 dark:text-red-400',
  removing: 'bg-red-500/15 text-red-600 dark:text-red-400'
}

function formatAge(createdAt: number): string {
  const ageMs = Math.max(0, Date.now() - createdAt)
  const minutes = Math.floor(ageMs / 60_000)
  if (minutes < 1) {
    return translate('auto.components.docker.age.justNow', 'now')
  }
  if (minutes < 60) {
    return translate('auto.components.docker.age.minutesAgo', '{{value0}}m', {
      value0: String(minutes)
    })
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return translate('auto.components.docker.age.hoursAgo', '{{value0}}h', {
      value0: String(hours)
    })
  }
  const days = Math.floor(hours / 24)
  return translate('auto.components.docker.age.daysAgo', '{{value0}}d', {
    value0: String(days)
  })
}

function ContainerStateBadge({ state }: { state: DockerContainer['state'] }): React.JSX.Element {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-transparent font-medium',
        STATE_STYLES[state] ?? 'bg-neutral-500/15 text-neutral-500 dark:text-neutral-400'
      )}
    >
      {state}
    </Badge>
  )
}

function ContainerActionsMenu({
  hostId,
  container,
  busy,
  onAction
}: {
  hostId: DockerHostResult['hostId']
  container: DockerContainer
  busy: boolean
  onAction: (request: DockerContainerActionRequest, action: 'start' | 'stop' | 'restart' | 'remove') => void
}): React.JSX.Element {
  const running = container.state === 'running'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={busy}
          aria-label={translate('auto.components.docker.actions.menu', 'Container actions')}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <span className="text-muted-foreground">•••</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {!running ? (
          <DropdownMenuItem
            onSelect={() => onAction({ hostId, containerId: container.id }, 'start')}
          >
            <Play className="size-3.5" aria-hidden />
            {translate('auto.components.docker.actions.start', 'Start')}
          </DropdownMenuItem>
        ) : null}
        {running ? (
          <DropdownMenuItem
            onSelect={() => onAction({ hostId, containerId: container.id }, 'stop')}
          >
            <CircleStop className="size-3.5" aria-hidden />
            {translate('auto.components.docker.actions.stop', 'Stop')}
          </DropdownMenuItem>
        ) : null}
        {running ? (
          <DropdownMenuItem
            onSelect={() => onAction({ hostId, containerId: container.id }, 'restart')}
          >
            <RotateCw className="size-3.5" aria-hidden />
            {translate('auto.components.docker.actions.restart', 'Restart')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onAction({ hostId, containerId: container.id }, 'remove')}
        >
          <Trash2 className="size-3.5" aria-hidden />
          {translate('auto.components.docker.actions.remove', 'Remove')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DockerHostSection({
  host,
  busyContainerIds,
  onAction
}: {
  host: DockerHostResult
  busyContainerIds: ReadonlySet<string>
  onAction: (
    request: DockerContainerActionRequest,
    action: 'start' | 'stop' | 'restart' | 'remove'
  ) => void
}): React.JSX.Element {
  const isLocal = host.hostId === 'local'
  const error = host.error

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        {isLocal ? (
          <Boxes className="size-4 text-muted-foreground/60" aria-hidden />
        ) : (
          <Server className="size-4 text-muted-foreground/60" aria-hidden />
        )}
        <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{host.label}</h2>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
          {host.containers.length}{' '}
          {translate('auto.components.docker.host.containerCount', 'containers')}
        </span>
        {error ? (
          <span className="ml-auto text-[12px] text-destructive">{error}</span>
        ) : null}
      </div>
      {!error ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">
                  {translate('auto.components.docker.table.name', 'Name')}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {translate('auto.components.docker.table.image', 'Image')}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {translate('auto.components.docker.table.status', 'Status')}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {translate('auto.components.docker.table.ports', 'Ports')}
                </th>
                <th className="px-3 py-2 font-semibold">
                  {translate('auto.components.docker.table.age', 'Age')}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  {translate('auto.components.docker.table.actions', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {host.containers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-[13px] text-muted-foreground"
                  >
                    {translate(
                      'auto.components.docker.empty',
                      'No running containers on this host.'
                    )}
                  </td>
                </tr>
              ) : (
                host.containers.map((container) => (
                  <tr
                    key={container.id}
                    className="border-b border-border/60 last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="max-w-[220px] truncate px-3 py-2 font-mono text-[12px] text-foreground">
                      {container.name}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 font-mono text-[12px] text-muted-foreground">
                      {container.image}
                    </td>
                    <td className="px-3 py-2">
                      <ContainerStateBadge state={container.state} />
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2 font-mono text-[12px] text-muted-foreground">
                      {container.ports || '—'}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-muted-foreground">
                      {formatAge(container.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ContainerActionsMenu
                        hostId={host.hostId}
                        container={container}
                        busy={busyContainerIds.has(container.id)}
                        onAction={onAction}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
