// Cloudflare Relay — replaces the Orca Cloud relay with a self-hosted
// per-machine Cloudflare Tunnel. Each Orca install provisions a persistent
// subdomain (wss://orca-<machineId>.<domain>), runs cloudflared against its
// own WS transport, and auto-advertises the endpoint in mobile pairing.
// Requires a Cloudflare API token (Account-Tunnel:Edit, Zone-DNS:Edit) and a
// `cloudflared` binary on PATH (or ORCA_CLOUDFLARED_PATH).
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Store } from '../../persistence'
import { CloudflareRelayProvisioner } from './cloudflare-relay-provision'

export { deriveRelayHostname } from './cloudflare-relay-provision'

export type CloudflareRelayStatus =
  | { state: 'disabled' }
  | { state: 'provisioning' }
  | { state: 'running'; hostname: string; tunnelName: string }
  | { state: 'error'; message: string }

type CloudflareRelayOptions = {
  store: Store
  userDataPath: string
  fetch?: typeof globalThis.fetch
  /** Why: the WS port is only known after the transport binds; a provider lets
   * runtime toggles start the tunnel without waiting for the next app launch. */
  getWsPort?: () => number | null
}

type RelayState = {
  machineId: string
  tunnelName?: string
  tunnelId?: string
  hostname?: string
}

export class CloudflareRelayService {
  private readonly store: Store
  private readonly stateDir: string
  private readonly fetchFn: typeof globalThis.fetch
  private readonly getWsPort: () => number | null
  private child: ChildProcess | null = null
  private respawnTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private status: CloudflareRelayStatus = { state: 'disabled' }
  private wsPort: number | null = null

  constructor(options: CloudflareRelayOptions) {
    this.store = options.store
    this.stateDir = join(options.userDataPath, 'cloudflare-relay')
    this.fetchFn = options.fetch ?? globalThis.fetch
    this.getWsPort = options.getWsPort ?? (() => this.wsPort)
  }

  getStatus(): CloudflareRelayStatus {
    return this.status
  }

  // Why: runtime toggle — persists the setting, then starts/stops the tunnel
  // immediately instead of waiting for the next app launch.
  async setEnabled(enabled: boolean): Promise<{ ok: boolean; error?: string }> {
    this.store.updateSettings({ cloudflareRelayEnabled: enabled })
    if (!enabled) {
      this.stop()
      return { ok: true }
    }
    const port = this.getWsPort()
    if (port === null) {
      return { ok: false, error: 'WebSocket transport is not ready yet; try again.' }
    }
    await this.start(port)
    const status = this.status
    return status.state === 'error'
      ? { ok: false, error: status.message }
      : { ok: true }
  }

  // Why: called once the WS transport binds; the ingress must point at the
  // real resolved port, not the configured default.
  async start(wsPort: number): Promise<void> {
    this.stopped = false
    this.wsPort = wsPort
    const settings = this.store.getSettings()
    const token = settings.cloudflareRelayToken?.trim()
    const domain = settings.cloudflareRelayDomain?.trim()
    // Why: active by default — presence of token + domain is the on-switch;
    // no separate enable toggle to keep set.
    if (!token || !domain) {
      this.status = { state: 'disabled' }
      return
    }
    try {
      this.status = { state: 'provisioning' }
      const { hostname, tunnelName } = await new CloudflareRelayProvisioner({
        token,
        domain,
        stateDir: this.stateDir,
        fetch: this.fetchFn
      }).provision()
      const binary = this.resolveCloudflaredBinary()
      if (!binary) {
        this.status = {
          state: 'error',
          message: 'cloudflared not found — install it or set ORCA_CLOUDFLARED_PATH.'
        }
        return
      }
      this.spawnTunnel(binary, hostname)
      // Why: make pairing auto-advertise the tunnel endpoint without any UI
      // interaction — the renderer already prefers the persisted custom address.
      this.store.updateSettings({ cloudflareRelayHostname: `wss://${hostname}` })
      if (this.store.getSettings().mobilePairingCustomAddress !== `wss://${hostname}`) {
        this.store.updateSettings({ mobilePairingCustomAddress: `wss://${hostname}` })
      }
      this.status = { state: 'running', hostname, tunnelName }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Why: provisioning failures are otherwise invisible (status is only in
      // memory); surface them for diagnosis.
      console.error('[cloudflare-relay] provisioning failed:', message)
      this.status = { state: 'error', message }
    }
  }

  stop(): void {
    this.stopped = true
    if (this.respawnTimer) {
      clearTimeout(this.respawnTimer)
      this.respawnTimer = null
    }
    if (this.child) {
      this.child.kill()
      this.child = null
    }
  }

  // ── cloudflared lifecycle ──────────────────────────────────────────

  private resolveCloudflaredBinary(): string | null {
    const explicit = process.env.ORCA_CLOUDFLARED_PATH
    if (explicit && existsSync(explicit)) {
      return explicit
    }
    const candidates = [
      ...(process.env.PATH ?? '').split(':'),
      '/usr/local/bin',
      join(process.env.HOME ?? '', '.local', 'bin')
    ]
    for (const dir of new Set(candidates.filter(Boolean))) {
      const candidate = join(dir, 'cloudflared')
      if (existsSync(candidate)) {
        return candidate
      }
    }
    return null
  }

  private spawnTunnel(binary: string, hostname: string): void {
    const state = this.readState()
    const tunnelId = state.tunnelId
    if (!tunnelId || state.hostname !== hostname) {
      throw new Error('Relay provisioning state is inconsistent; restart Orca to re-provision.')
    }
    const configPath = join(this.stateDir, 'config.yml')
    mkdirSync(this.stateDir, { recursive: true })
    writeFileSync(
      configPath,
      [
        `tunnel: ${tunnelId}`,
        `credentials-file: ${join(this.stateDir, `${tunnelId}.json`)}`,
        '',
        'ingress:',
        `  - hostname: ${hostname}`,
        `    service: http://localhost:${this.wsPort ?? 6768}`,
        '  - service: http_status:404',
        ''
      ].join('\n'),
      'utf8'
    )
    this.launchChild(binary, configPath)
  }

  private readState(): RelayState {
    try {
      return JSON.parse(readFileSync(join(this.stateDir, 'state.json'), 'utf8')) as RelayState
    } catch {
      return { machineId: '' }
    }
  }

  private launchChild(binary: string, configPath: string): void {
    if (this.stopped || this.child) {
      return
    }
    const child = spawn(binary, ['tunnel', '--config', configPath, 'run'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    })
    this.child = child
    // Why: surface cloudflared's own diagnostics so a misconfigured tunnel
    // isn't a silent black hole.
    child.stdout?.on('data', (chunk: Buffer) => {
      process.stdout.write(`[cloudflare-relay] ${chunk.toString()}`)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(`[cloudflare-relay] ${chunk.toString()}`)
    })
    child.on('exit', () => {
      this.child = null
      if (this.stopped) {
        return
      }
      // Why: cloudflared should run indefinitely; respawn on unexpected exit.
      this.respawnTimer = setTimeout(() => {
        this.respawnTimer = null
        if (!this.stopped && this.wsPort !== null) {
          void this.start(this.wsPort).catch(() => undefined)
        }
      }, 3_000)
    })
    child.on('error', (err) => {
      this.status = { state: 'error', message: `Failed to start cloudflared: ${err.message}` }
    })
  }
}
