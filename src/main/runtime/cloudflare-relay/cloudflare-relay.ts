// Cloudflare Relay — replaces the Orca Cloud relay with a self-hosted
// per-machine Cloudflare Tunnel. Each Orca install provisions a persistent
// subdomain (wss://orca-<machineId>.<domain>), runs cloudflared against its
// own WS transport, and auto-advertises the endpoint in mobile pairing.
// Requires a Cloudflare API token (Account-Tunnel:Edit, Zone-DNS:Edit) and a
// `cloudflared` binary on PATH (or ORCA_CLOUDFLARED_PATH).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
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

  // Why: runtime restart — tears down the tunnel and re-provisions so the
  // systemd unit reconnects with the current WS port.
  async restart(): Promise<{ ok: boolean; error?: string }> {
    const port = this.getWsPort()
    if (port === null) {
      return { ok: false, error: 'WebSocket transport is not ready.' }
    }
    this.stop()
    await this.start(port)
    return this.status.state === 'error'
      ? { ok: false, error: this.status.message }
      : { ok: true }
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
      this.runTunnel(binary, hostname)
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
    // Why: with systemd the tunnel keeps running after Orca quits (persistent
    // URL); only the fallback in-process child is killed here.
    if (this.child) {
      this.child.kill()
      this.child = null
    }
  }

  // ── persistent tunnel management ───────────────────────────────────

  // Why: the tunnel is a durable artifact — the same URL survives Orca restarts
  // (and even Orca being closed) until the user explicitly deletes it.
  async deleteTunnel(): Promise<{ ok: boolean; error?: string }> {
    const state = this.readState()
    const settings = this.store.getSettings()
    const token = settings.cloudflareRelayToken?.trim()
    this.stop()
    try {
      await this.teardownSystemdService()
      if (state.tunnelId && token) {
        await new CloudflareRelayProvisioner({
          token,
          domain: settings.cloudflareRelayDomain?.trim() ?? '',
          stateDir: this.stateDir,
          fetch: this.fetchFn
        }).deleteTunnel(state.tunnelId, state.hostname)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[cloudflare-relay] delete failed:', message)
      return { ok: false, error: message }
    } finally {
      // Why: keep machineId so a later Connect recreates the same URL.
      this.writeState({ machineId: state.machineId })
      this.store.updateSettings({ cloudflareRelayHostname: '' })
      if (this.store.getSettings().mobilePairingCustomAddress?.startsWith('wss://')) {
        this.store.updateSettings({ mobilePairingCustomAddress: '' })
      }
      this.status = { state: 'disabled' }
    }
    return { ok: true }
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

  private runTunnel(binary: string, hostname: string): void {
    const configPath = this.writeTunnelConfig(hostname)
    // Why: a systemd user service keeps the tunnel alive independent of Orca —
    // close the IDE, the URL keeps serving. Fall back to an in-process child
    // when systemd is unavailable (containers, WSL without systemd).
    if (!this.installSystemdService(binary, configPath)) {
      this.launchChild(binary, configPath)
    }
  }

  private writeTunnelConfig(hostname: string): string {
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
        // Why: some networks block outbound QUIC/UDP 7844 and Asia-edge
        // (cgk/sin) is intermittently filtered by ISPs in this region; HTTP/2
        // over the US edge has proven reliable here.
        'protocol: http2',
        'region: us',
        '',
        'ingress:',
        `  - hostname: ${hostname}`,
        `    service: http://localhost:${this.wsPort ?? 6768}`,
        '  - service: http_status:404',
        ''
      ].join('\n'),
      'utf8'
    )
    return configPath
  }

  private installSystemdService(binary: string, configPath: string): boolean {
    const unitName = 'orca-cloudflare-tunnel.service'
    const unitDir = join(process.env.HOME ?? '', '.config', 'systemd', 'user')
    try {
      mkdirSync(unitDir, { recursive: true })
      writeFileSync(
        join(unitDir, unitName),
        [
          '[Unit]',
          'Description=Orca Cloudflare Relay Tunnel',
          'After=network-online.target',
          '',
          '[Service]',
          `ExecStart=${binary} tunnel --protocol http2 --region us --config ${configPath} run`,
          'Restart=always',
          'RestartSec=3',
          '',
          '[Install]',
          'WantedBy=default.target',
          ''
        ].join('\n'),
        'utf8'
      )
      const run = (args: string[]): boolean => {
        const result = spawnSync('systemctl', ['--user', ...args], { stdio: 'ignore' })
        return result.status === 0
      }
      run(['daemon-reload'])
      run(['enable', unitName])
      return run(['restart', unitName])
    } catch {
      return false
    }
  }

  private teardownSystemdService(): void {
    const unitName = 'orca-cloudflare-tunnel.service'
    try {
      spawnSync('systemctl', ['--user', 'disable', '--now', unitName], { stdio: 'ignore' })
      const unitPath = join(process.env.HOME ?? '', '.config', 'systemd', 'user', unitName)
      if (existsSync(unitPath)) {
        unlinkSync(unitPath)
      }
      spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' })
    } catch {
      // best-effort teardown
    }
  }

  private readState(): RelayState {
    try {
      return JSON.parse(readFileSync(join(this.stateDir, 'state.json'), 'utf8')) as RelayState
    } catch {
      return { machineId: '' }
    }
  }

  private writeState(state: RelayState): void {
    mkdirSync(this.stateDir, { recursive: true })
    writeFileSync(join(this.stateDir, 'state.json'), JSON.stringify(state, null, 2), 'utf8')
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
