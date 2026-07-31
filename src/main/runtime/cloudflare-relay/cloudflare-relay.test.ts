import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CloudflareRelayService, deriveRelayHostname } from './cloudflare-relay'
import type { GlobalSettings } from '../../../shared/types'
import type { Store } from '../../persistence'

// Why: tests must not launch a real cloudflared; a sleep-loop stub proves the
// spawn + status path without touching the network.
const FAKE_CLOUDFLARED = '#!/bin/sh\nexec sleep 300\n'

function installFakeCloudflared(dir: string): string {
  const bin = join(dir, 'cloudflared')
  writeFileSync(bin, FAKE_CLOUDFLARED, { mode: 0o755 })
  chmodSync(bin, 0o755)
  process.env.ORCA_CLOUDFLARED_PATH = bin
  return bin
}

function fakeStore(initial: Partial<GlobalSettings> = {}) {
  const settings: GlobalSettings = {
    mobilePairingConnectionMode: 'automatic',
    mobilePairingCustomAddress: '',
    cloudflareRelayEnabled: false,
    cloudflareRelayToken: '',
    cloudflareRelayDomain: '',
    cloudflareRelayHostname: '',
    ...initial
  } as GlobalSettings
  return {
    getSettings: () => settings,
    updateSettings: (patch: Partial<GlobalSettings>) => Object.assign(settings, patch)
  } as unknown as Store
}

type Route = { path: string; body: unknown }

function mockFetch(routes: Route[]): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    // Why: match on pathname + the query marker, never a raw substring — a
    // route like /zones/z1 would otherwise shadow /zones/z1/dns_records.
    const parsed = new URL(url)
    const route = routes.find((r) => {
      const [rp, rq] = r.path.split('?')
      if (!parsed.pathname.endsWith(rp)) {
        return false
      }
      return rq === undefined || parsed.search.includes(rq)
    })
    if (!route) {
      throw new Error(`unexpected fetch: ${url}`)
    }
    return {
      ok: true,
      status: 200,
      json: async () => route.body
    } as Response
  }) as typeof globalThis.fetch
}

describe('CloudflareRelayService', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cf-relay-test-'))
  })

  afterEach(() => {
    delete process.env.ORCA_CLOUDFLARED_PATH
  })

  it('derives a stable per-machine hostname', () => {
    expect(deriveRelayHostname('a1b2c3d4e5f6a7b8', 'ikamai.com')).toBe('orca-a1b2c3d4.ikamai.com')
    // Why: identity comes from machineId only, so the label never depends on
    // the (unreliable) OS hostname.
    expect(deriveRelayHostname('zz1234560000', 'example.org')).toBe('orca-zz123456.example.org')
  })

  it('provisions a tunnel + DNS and reports running', async () => {
    const store = fakeStore({
      cloudflareRelayEnabled: true,
      cloudflareRelayToken: 'tok',
      cloudflareRelayDomain: 'ikamai.com'
    })
    const fetchFn = mockFetch([
      {
        path: '/zones?name=ikamai.com',
        body: { success: true, result: [{ id: 'z1', account: { id: 'a1' } }] }
      },
      { path: '/zones/z1', body: { success: true, result: { id: 'z1', account: { id: 'a1' } } } },
      { path: '/accounts/a1/cfd_tunnel?name=', body: { success: true, result: [] } },
      {
        path: '/accounts/a1/cfd_tunnel',
        body: {
          success: true,
          result: { id: 't1', name: 'orca-x', account_tag: 'a1', tunnel_secret: 'secret-1' }
        }
      },
      { path: '/zones/z1/dns_records?name=', body: { success: true, result: [] } },
      {
        path: '/zones/z1/dns_records',
        body: {
          success: true,
          result: { id: 'd1', name: 'orca-x.ikamai.com', content: 't1.cfargotunnel.com' }
        }
      }
    ])
    installFakeCloudflared(dir)
    const service = new CloudflareRelayService({
      store,
      userDataPath: dir,
      fetch: fetchFn
    })
    await service.start(6768)

    const status = service.getStatus()
    expect(status.state).toBe('running')
    if (status.state === 'running') {
      expect(status.hostname).toMatch(/^orca-[0-9a-f]{8}\.ikamai\.com$/)
    }
    // Why: the endpoint is auto-advertised so pairing needs zero UI input.
    expect(store.getSettings().cloudflareRelayHostname).toMatch(/^wss:\/\/orca-/)
    expect(store.getSettings().mobilePairingCustomAddress).toBe(
      store.getSettings().cloudflareRelayHostname
    )
    expect(store.getSettings().mobilePairingCustomAddress).toMatch(
      /^wss:\/\/orca-[0-9a-f]{8}\.ikamai\.com$/
    )

    const files = readdirSync(join(dir, 'cloudflare-relay'))
    expect(files).toContain('state.json')
    expect(files.some((f) => f.endsWith('.json') && f !== 'state.json')).toBe(true)
    const config = readFileSync(join(dir, 'cloudflare-relay', 'config.yml'), 'utf8')
    expect(config).toContain('service: http://localhost:6768')
    service.stop()
  })

  it('orphans a credential-less existing tunnel and provisions a fresh one', async () => {
    const store = fakeStore({
      cloudflareRelayEnabled: true,
      cloudflareRelayToken: 'tok',
      cloudflareRelayDomain: 'ikamai.com'
    })
    const fetchFn = mockFetch([
      {
        path: '/zones?name=ikamai.com',
        body: { success: true, result: [{ id: 'z1', account: { id: 'a1' } }] }
      },
      { path: '/zones/z1', body: { success: true, result: { id: 'z1', account: { id: 'a1' } } } },
      {
        path: '/accounts/a1/cfd_tunnel?name=',
        body: { success: true, result: [{ id: 't9', name: 'orca-x' }] }
      },
      {
        path: '/accounts/a1/cfd_tunnel',
        body: {
          success: true,
          result: { id: 't2', name: 'orca-x-12ab', account_tag: 'a1', tunnel_secret: 'secret-2' }
        }
      },
      { path: '/zones/z1/dns_records?name=', body: { success: true, result: [] } },
      {
        path: '/zones/z1/dns_records',
        body: { success: true, result: { id: 'd2' } }
      }
    ])
    installFakeCloudflared(dir)
    const service = new CloudflareRelayService({
      store,
      userDataPath: dir,
      fetch: fetchFn
    })
    await service.start(6768)
    const status = service.getStatus()
    expect(status.state).toBe('running')
    if (status.state === 'running') {
      expect(status.tunnelName).toMatch(/^orca-x-[0-9a-f]{4}$/)
    }
    service.stop()
  })

  it('stays disabled without a token or domain', async () => {
    const store = fakeStore({ cloudflareRelayEnabled: true })
    const service = new CloudflareRelayService({ store, userDataPath: dir })
    await service.start(6768)
    expect(service.getStatus().state).toBe('disabled')
    service.stop()
  })

  it('stays disabled when the toggle is off', async () => {
    const store = fakeStore({ cloudflareRelayEnabled: false })
    const service = new CloudflareRelayService({ store, userDataPath: dir })
    await service.start(6768)
    expect(service.getStatus().state).toBe('disabled')
    service.stop()
  })
})
