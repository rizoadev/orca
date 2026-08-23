/**
 * Reference counting for the long-lived agent-harness engines, kept in the IPC
 * layer (not the managers) so the manager files stay within the line budget.
 *
 * Why: reasonix/openchamber keep one server per worktree and never stopped them
 * on view close or worktree switch, so merely visiting projects accumulated
 * running engines. acquire()/release() let an in-app view and a browser tab
 * share one server and stop it only once the last consumer goes away, which
 * is what cools the CPU/memory down.
 */
import type { ServiceCooldownId } from '../../shared/service-cooldown-types'

const refCounts = new Map<string, number>()

function refKey(service: ServiceCooldownId, projectPath: string | null): string {
  // Why: singletons (deepseek, paseo) ignore the path — one host per service.
  return projectPath ? `${service}:${projectPath}` : service
}

/** Record a new consumer. Returns true when this is the first (start needed). */
export function acquireHarness(service: ServiceCooldownId, projectPath: string | null): boolean {
  const key = refKey(service, projectPath)
  const next = (refCounts.get(key) ?? 0) + 1
  refCounts.set(key, next)
  return next === 1
}

/** Drop a consumer. Returns true when this was the last (stop needed). */
export function releaseHarness(service: ServiceCooldownId, projectPath: string | null): boolean {
  const key = refKey(service, projectPath)
  const next = (refCounts.get(key) ?? 0) - 1
  if (next <= 0) {
    refCounts.delete(key)
    return true
  }
  refCounts.set(key, next)
  return false
}

/** Drop every tracked consumer (used when Service Cooldown stops all services). */
export function resetHarnessRefCounts(): void {
  refCounts.clear()
}

/**
 * Drop the tracked consumers for one service (used when a single service is
 * cooled down). Why: a cooled-down server is force-stopped, so its stale
 * reference counts must be cleared — otherwise the next tab open would inherit
 * them and the server would never stop on close. Only this service's keys are
 * touched so other running services keep their counts.
 */
export function resetHarnessRefCountsFor(service: ServiceCooldownId): void {
  for (const key of refCounts.keys()) {
    if (key === service || key.startsWith(`${service}:`)) {
      refCounts.delete(key)
    }
  }
}
