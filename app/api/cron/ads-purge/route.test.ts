// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  cleanup: vi.fn(),
  calls: [] as string[],
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/lib/ads/google-connections', () => ({
  cleanupExpiredGoogleAdsOAuthFlows: (...args: unknown[]) => {
    mocks.calls.push('cleanup')
    return mocks.cleanup(...args)
  },
}))

import { GET } from './route'

function request(authorization?: string) {
  return new Request('https://gloval.ai/api/cron/ads-purge', {
    headers: authorization ? { authorization } : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  mocks.calls = []
  mocks.cleanup.mockResolvedValue({
    flowsRemoved: 2,
    tokensRevoked: 1,
    ciphertextsCleared: 2,
    revokeFailures: 1,
  })
  mocks.rpc.mockImplementation(async () => {
    mocks.calls.push('purge-rpc')
    return {
      data: {
        free_usage: 0,
        reservations: 0,
        anon_hashes: 0,
        usage_events: 0,
        alerts: 0,
        google_oauth_flows: 0,
        google_api_operations: 0,
        batch: 5000,
      },
      error: null,
    }
  })
})

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/cron/ads-purge', () => {
  it('rejects requests without the cron bearer secret before touching cleanup or SQL RPCs', async () => {
    const response = await GET(request('Bearer wrong-secret'))

    expect(response.status).toBe(401)
    expect(mocks.cleanup).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('cleans expired pending tokens before invoking the retention purge RPC', async () => {
    const response = await GET(request('Bearer cron-secret'))

    expect(response.status).toBe(200)
    expect(mocks.calls).toEqual(['cleanup', 'purge-rpc'])
    expect(await response.json()).toMatchObject({
      ok: true,
      oauthCleanup: {
        flowsRemoved: 2,
        tokensRevoked: 1,
        ciphertextsCleared: 2,
        revokeFailures: 1,
      },
    })
  })

  it('does not invoke the purge RPC if pending-token cleanup cannot complete safely', async () => {
    mocks.cleanup.mockRejectedValueOnce(new Error('cleanup failure'))
    const response = await GET(request('Bearer cron-secret'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'purge_failed' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns not_configured when the cron secret is absent', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const response = await GET(request('Bearer cron-secret'))

    expect(response.status).toBe(503)
    expect(mocks.cleanup).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
