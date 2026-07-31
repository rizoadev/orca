// Cloudflare Relay provisioning — idempotent per-machine tunnel + DNS setup.
// One stable subdomain per Orca install: orca-<machineId8>.<domain>. The
// machineId persists in state.json, so re-provisioning after a restart (or a
// settings edit) resolves the same tunnel and hostname.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CF_API = 'https://api.cloudflare.com/client/v4'

type Zone = { id: string; account: { id: string } }
type CfdTunnel = { id: string; name: string }
type CfdTunnelCreateResult = {
  id: string
  name: string
  tunnel_secret: string
  account_tag: string
}
type RelayState = {
  machineId: string
  tunnelName?: string
  tunnelId?: string
  hostname?: string
}
type CfResponse = {
  success: boolean
  result: unknown
  errors?: { code: number; message: string }[]
}

function shortMachineLabel(machineId: string): string {
  return machineId.slice(0, 8)
}

export function deriveRelayHostname(machineId: string, domain: string): string {
  return `orca-${shortMachineLabel(machineId)}.${domain}`
}

type ProvisionerOptions = {
  token: string
  domain: string
  stateDir: string
  fetch?: typeof globalThis.fetch
}

export class CloudflareRelayProvisioner {
  private readonly token: string
  private readonly domain: string
  private readonly stateDir: string
  private readonly fetchFn: typeof globalThis.fetch

  constructor(options: ProvisionerOptions) {
    this.token = options.token
    this.domain = options.domain
    this.stateDir = options.stateDir
    this.fetchFn = options.fetch ?? globalThis.fetch
  }

  async provision(): Promise<{ hostname: string; tunnelName: string }> {
    const state = this.loadState()
    const hostname = deriveRelayHostname(state.machineId, this.domain)
    const zoneId = await this.resolveZoneId()
    const accountId = await this.resolveAccountId(zoneId)
    const baseTunnelName = `orca-${shortMachineLabel(state.machineId)}`

    // Why: an existing tunnel without local credentials cannot be run (the
    // secret is only returned at creation); orphan it and mint a fresh one
    // under a distinct name so it never collides with the orphan's DNS route.
    let existing = await this.findTunnel(accountId, baseTunnelName)
    if (existing && !this.hasCredentials(existing.id)) {
      existing = null
    }
    const tunnelName = existing
      ? existing.name
      : `${baseTunnelName}-${randomBytes(2).toString('hex')}`
    let tunnel = existing
    if (!tunnel) {
      const created = await this.createTunnel(accountId, tunnelName)
      this.writeCredentials(created)
      tunnel = { id: created.id, name: created.name }
    }
    await this.ensureDnsRecord(zoneId, hostname, tunnel.id)
    this.writeState({ ...state, tunnelName: tunnel.name, tunnelId: tunnel.id, hostname })
    return { hostname, tunnelName: tunnel.name }
  }

  private async resolveZoneId(): Promise<string> {
    const body = await this.cf(`/zones?name=${encodeURIComponent(this.domain)}`)
    const zone = (body.result as Zone[] | undefined)?.[0]
    if (!zone) {
      throw new Error(`Domain ${this.domain} is not on this Cloudflare account.`)
    }
    return zone.id
  }

  private async resolveAccountId(zoneId: string): Promise<string> {
    const body = await this.cf(`/zones/${zoneId}`)
    const zone = body.result as Zone | undefined
    if (!zone?.account?.id) {
      throw new Error('Could not resolve Cloudflare account for the zone.')
    }
    return zone.account.id
  }

  private async findTunnel(accountId: string, tunnelName: string): Promise<CfdTunnel | null> {
    const body = await this.cf(
      `/accounts/${accountId}/cfd_tunnel?name=${encodeURIComponent(tunnelName)}&is_deleted=false`
    )
    const list = body.result as CfdTunnel[] | undefined
    return list?.find((t) => t.name === tunnelName) ?? null
  }

  private async createTunnel(
    accountId: string,
    tunnelName: string
  ): Promise<CfdTunnelCreateResult> {
    const body = await this.cf(`/accounts/${accountId}/cfd_tunnel`, {
      method: 'POST',
      body: JSON.stringify({ name: tunnelName, tunnel_secret: randomBytes(32).toString('hex') })
    })
    const tunnel = body.result as CfdTunnelCreateResult | undefined
    if (!tunnel?.id || !tunnel.tunnel_secret) {
      throw new Error('Cloudflare tunnel creation returned no secret.')
    }
    return tunnel
  }

  private async ensureDnsRecord(zoneId: string, hostname: string, tunnelId: string): Promise<void> {
    const list = await this.cf(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}`)
    const existing = (list.result as { name: string }[] | undefined)?.find(
      (r) => r.name === hostname
    )
    if (existing) {
      return
    }
    await this.cf(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'CNAME',
        name: hostname,
        content: `${tunnelId}.cfargotunnel.com`,
        proxied: true,
        comment: 'Orca Cloudflare Relay'
      })
    })
  }

  private async cf(path: string, init?: { method?: string; body?: string }): Promise<CfResponse> {
    const response = await this.fetchFn(`${CF_API}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(init?.body ? { 'content-type': 'application/json' } : {})
      },
      body: init?.body
    })
    if (!response.ok) {
      throw new Error(`Cloudflare API ${response.status} on ${path}`)
    }
    const body = (await response.json()) as CfResponse
    if (!body.success) {
      throw new Error(`Cloudflare API error: ${body.errors?.[0]?.message ?? 'unknown'}`)
    }
    return body
  }

  private loadState(): RelayState {
    mkdirSync(this.stateDir, { recursive: true })
    const file = join(this.stateDir, 'state.json')
    if (existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<RelayState>
        if (typeof parsed.machineId === 'string' && parsed.machineId.length > 0) {
          return parsed as RelayState
        }
      } catch {
        // fall through to a fresh identity
      }
    }
    // Why: machineId is the persistent identity — the subdomain stays stable
    // across restarts as long as userData survives.
    const fresh: RelayState = { machineId: randomBytes(8).toString('hex') }
    this.writeState(fresh)
    return fresh
  }

  private writeState(state: RelayState): void {
    mkdirSync(this.stateDir, { recursive: true })
    writeFileSync(join(this.stateDir, 'state.json'), JSON.stringify(state, null, 2), 'utf8')
  }

  private credentialsPath(tunnelId: string): string {
    return join(this.stateDir, `${tunnelId}.json`)
  }

  private hasCredentials(tunnelId: string): boolean {
    return existsSync(this.credentialsPath(tunnelId))
  }

  private writeCredentials(tunnel: CfdTunnelCreateResult): void {
    mkdirSync(this.stateDir, { recursive: true })
    writeFileSync(
      this.credentialsPath(tunnel.id),
      JSON.stringify(
        {
          AccountTag: tunnel.account_tag,
          TunnelSecret: tunnel.tunnel_secret,
          TunnelID: tunnel.id
        },
        null,
        2
      ),
      { mode: 0o600 }
    )
  }
}
