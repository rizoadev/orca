import { describe, expect, it, vi } from 'vitest'

const netFetchMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  net: { fetch: netFetchMock }
}))

import { fetchDeepSeekRateLimits } from './deepseek-fetcher'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response
}

describe('fetchDeepSeekRateLimits', () => {
  beforeEach(() => {
    netFetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns unavailable when no API key is configured', async () => {
    const result = await fetchDeepSeekRateLimits({ apiKey: '' })
    expect(result.provider).toBe('deepseek')
    expect(result.status).toBe('unavailable')
    expect(result.session).toBeNull()
    expect(result.weekly).toBeNull()
    expect(netFetchMock).not.toHaveBeenCalled()
  })

  it('returns unavailable when API key is undefined', async () => {
    const result = await fetchDeepSeekRateLimits()
    expect(result.status).toBe('unavailable')
    expect(netFetchMock).not.toHaveBeenCalled()
  })

  it('maps package usage to session and balance to weekly', async () => {
    netFetchMock.mockResolvedValueOnce(
      jsonResponse({
        balance: {
          total_pay: { val: '100.0' },
          payment_amount: { val: '25.0' },
          remaining_amount: { val: '75.0' },
          expire_at: '2026-09-01T00:00:00Z'
        },
        package_usages: [{ group_id: 'deepseek', left_points: '200', total_points: '1000' }]
      })
    )

    const result = await fetchDeepSeekRateLimits({ apiKey: 'sk-test' })

    expect(result.status).toBe('ok')
    expect(result.provider).toBe('deepseek')
    // Package: (1000-200)/1000 = 80% used
    expect(result.session?.usedPercent).toBeCloseTo(80)
    // Balance: 25/100 = 25% used
    expect(result.weekly?.usedPercent).toBeCloseTo(25)
    // Bearer token from the API key is sent
    const [, init] = netFetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
  })

  it('falls back to balance usage when package_usages is empty', async () => {
    netFetchMock.mockResolvedValueOnce(
      jsonResponse({
        balance: {
          total_pay: { val: '50.0' },
          payment_amount: { val: '10.0' },
          remaining_amount: { val: '40.0' },
          expire_at: '2026-10-01T00:00:00Z'
        },
        package_usages: []
      })
    )

    const result = await fetchDeepSeekRateLimits({ apiKey: 'sk-test' })

    expect(result.status).toBe('ok')
    expect(result.session?.usedPercent).toBeCloseTo(20) // 10/50
    expect(result.weekly?.usedPercent).toBeCloseTo(20) // 10/50
  })

  const USAGE_RESPONSE = {
    package_usages: [{ group_id: 'deepseek-coder', left_points: '800', total_points: '1000' }]
  }

  it('surfaces an error when the API key is rejected (401)', async () => {
    netFetchMock.mockResolvedValueOnce(jsonResponse({}, 401))

    const result = await fetchDeepSeekRateLimits({ apiKey: 'sk-bad' })
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/401/)
  })

  it('surfaces an error when the usage request fails (500)', async () => {
    netFetchMock.mockResolvedValueOnce(jsonResponse({}, 500))

    const result = await fetchDeepSeekRateLimits({ apiKey: 'sk-test' })
    expect(result.status).toBe('error')
    expect(result.session).toBeNull()
    expect(result.weekly).toBeNull()
  })

  it('treats an empty usage payload as an error', async () => {
    netFetchMock.mockResolvedValueOnce(jsonResponse({}))

    const result = await fetchDeepSeekRateLimits({ apiKey: 'sk-test' })
    expect(result.status).toBe('error')
    expect(result.error).toMatch(/usage data/)
    expect(result.session).toBeNull()
    expect(result.weekly).toBeNull()
  })

  it('handles numeric balance values', async () => {
    netFetchMock.mockResolvedValueOnce(
      jsonResponse({
        balance: {
          total_pay: { val: 200 },
          payment_amount: { val: 50 },
          remaining_amount: { val: 150 },
          expire_at: '2026-09-01T00:00:00Z'
        },
        package_usages: [{ left_points: 500, total_points: 1000 }]
      })
    )

    const result = await fetchDeepSeekRateLimits({ apiKey: 'sk-test' })
    expect(result.status).toBe('ok')
    expect(result.session?.usedPercent).toBeCloseTo(50) // (1000-500)/1000
    expect(result.weekly?.usedPercent).toBeCloseTo(25) // 50/200
  })
})
