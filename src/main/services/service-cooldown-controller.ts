/**
 * Service Cooldown controller (main process).
 *
 * Holds the per-service enabled flag, persists it to userData, and — when a
 * service is switched OFF (or "Cool Down All" is pressed) — invokes that
 * service's stop hook so its long-lived process/poller is actually torn down.
 * Harness IPC start handlers consult `isEnabled` to block re-spawns while a
 * service is cooled down.
 *
 * Why decoupled: the controller only knows stop hooks (injected by index.ts),
 * so the individual managers stay free of any cooldown awareness.
 */
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ServiceCooldownId,
  type ServiceCooldownState,
  defaultServiceCooldownState
} from '../../shared/service-cooldown-types'

/** A stop hook tears down a service's running work; may be async. */
export type ServiceStopHook = () => void | Promise<void>

export type ServiceCooldownControllerOptions = {
  /** Stop hook per service id; invoked when that service is cooled down. */
  stopHooks?: Partial<Record<ServiceCooldownId, ServiceStopHook>>
  /** Fired after any state change so the renderer can refresh its UI. */
  onStateChange?: (state: ServiceCooldownState) => void
  logger?: Pick<Console, 'debug' | 'warn'>
}

const STATE_FILE = 'service-cooldown.json'

export class ServiceCooldownController {
  private state: ServiceCooldownState
  private readonly stopHooks: Partial<Record<ServiceCooldownId, ServiceStopHook>>
  private readonly onStateChange: ((state: ServiceCooldownState) => void) | undefined
  private readonly logger: Pick<Console, 'debug' | 'warn'>

  constructor(options: ServiceCooldownControllerOptions = {}) {
    this.stopHooks = options.stopHooks ?? {}
    this.onStateChange = options.onStateChange
    this.logger = options.logger ?? console
    this.state = this.load()
  }

  private dataDir(): string {
    return join(app.getPath('userData'), 'service-cooldown')
  }

  private statePath(): string {
    return join(this.dataDir(), STATE_FILE)
  }

  private load(): ServiceCooldownState {
    const defaults = defaultServiceCooldownState()
    try {
      const file = this.statePath()
      if (!existsSync(file)) {
        return defaults
      }
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<ServiceCooldownState>
      // Why: merge over defaults so a stale/partial file never drops a service.
      return { ...defaults, ...raw }
    } catch (err) {
      this.logger.warn('[service-cooldown] failed to load state, using defaults', { error: err })
      return defaults
    }
  }

  private save(): void {
    try {
      const dir = this.dataDir()
      mkdirSync(dir, { recursive: true })
      writeFileSync(this.statePath(), JSON.stringify(this.state), 'utf8')
    } catch (err) {
      this.logger.warn('[service-cooldown] failed to persist state', { error: err })
    }
  }

  getState(): ServiceCooldownState {
    return { ...this.state }
  }

  isEnabled(id: ServiceCooldownId): boolean {
    return this.state[id] !== false
  }

  /** Block a harness spawn while its service is cooled down. */
  canStart(id: ServiceCooldownId): boolean {
    return this.isEnabled(id)
  }

  private async stopService(id: ServiceCooldownId): Promise<void> {
    const hook = this.stopHooks[id]
    if (!hook) {
      return
    }
    try {
      await hook()
    } catch (err) {
      this.logger.warn('[service-cooldown] stop hook failed', { id, error: err })
    }
  }

  async setService(id: ServiceCooldownId, enabled: boolean): Promise<ServiceCooldownState> {
    if (this.state[id] === enabled) {
      return this.getState()
    }
    this.state = { ...this.state, [id]: enabled }
    this.save()
    // Why: cooldown = tear the service down now; re-enable = just allow spawns.
    if (!enabled) {
      await this.stopService(id)
    }
    this.onStateChange?.(this.getState())
    return this.getState()
  }

  /** Cool down every service: stop all running work and block re-spawns. */
  async coolDownAll(): Promise<ServiceCooldownState> {
    const ids = Object.keys(this.state) as ServiceCooldownId[]
    this.state = ids.reduce((acc, id) => {
      acc[id] = false
      return acc
    }, {} as ServiceCooldownState)
    this.save()
    for (const id of ids) {
      await this.stopService(id)
    }
    this.onStateChange?.(this.getState())
    return this.getState()
  }

  /** Re-enable every service (spawns allowed again; nothing is force-started). */
  async resumeAll(): Promise<ServiceCooldownState> {
    this.state = defaultServiceCooldownState()
    this.save()
    this.onStateChange?.(this.getState())
    return this.getState()
  }
}
