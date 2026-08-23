/**
 * Status-bar control for Service Cooldown: a single button that opens a panel
 * to stop/resume Orca's long-lived background services (agent-harness engines,
 * SSH port scanners, notes sync, …) so the user can shed CPU/memory load.
 *
 * Why: reasonix/openchamber keep one server per worktree and never stopped them
 * on view close or worktree switch, so merely visiting projects accumulated
 * running engines. This panel is the master switch on top of the per-tab
 * reference counting that already stops an idle server when its last tab closes.
 */
import { useCallback, useEffect, useState } from 'react'
import { Power, Server } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
  SERVICE_COOLDOWN_IDS,
  SERVICE_COOLDOWN_LABELS,
  isServiceCooldownAllEnabled,
  type ServiceCooldownId,
  type ServiceCooldownState
} from '../../../../shared/service-cooldown-types'

export function ServiceCooldownButton(): React.JSX.Element | null {
  // Why: in dev the renderer can be hot-reloaded before the Electron preload
  // (which injects window.api.serviceCooldown) is rebuilt, leaving the API
  // undefined. Render nothing rather than crashing the status bar in that gap.
  const api = window.api.serviceCooldown
  const [state, setState] = useState<ServiceCooldownState | null>(null)

  const refresh = useCallback((): void => {
    if (!api) {
      return
    }
    void api.getState().then(setState)
  }, [api])

  useEffect(() => {
    refresh()
  }, [refresh])

  if (!api) {
    return null
  }

  const allEnabled = state ? isServiceCooldownAllEnabled(state) : true

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) {
          refresh()
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-5 w-5"
          aria-label="Service Cooldown"
          title={
            allEnabled
              ? 'Service Cooldown — all services running'
              : 'Service Cooldown — some services cooled down'
          }
        >
          <Server className="size-3.5" />
          {!allEnabled ? (
            <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-status-success" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Power className="size-3.5" />
          Service Cooldown
        </DropdownMenuLabel>
        <div className="flex gap-2 px-2 py-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 flex-1"
            onClick={() => {
              void api.coolDownAll().then(setState)
            }}
          >
            Cool Down All
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 flex-1"
            onClick={() => {
              void api.resumeAll().then(setState)
            }}
          >
            Resume All
          </Button>
        </div>
        <DropdownMenuSeparator />
        {SERVICE_COOLDOWN_IDS.map((id: ServiceCooldownId) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={state ? state[id] : true}
            onCheckedChange={(checked) => {
              void api.setService(id, checked).then(setState)
            }}
          >
            {SERVICE_COOLDOWN_LABELS[id]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
