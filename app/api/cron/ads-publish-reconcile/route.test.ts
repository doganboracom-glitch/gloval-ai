// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), notify: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/lib/ads/admin-alert', () => ({
  notifyGooglePublishReconciling: (...args: unknown[]) => mocks.notify(...args),
}))

import { GET } from './route'

const PLAN_ID = '123e4567-e89b-42d3-a456-426614174001'
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174002'

function request(authorization?: string) {
  return new Request('https://gloval.ai/api/cron/ads-publish-reconcile', {
    headers: authorization ? { authorization } : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
  mocks.rpc.mockResolvedValue({
    data: [{ plan_id: PLAN_ID, publish_request_id: REQUEST_ID }],
    error: null,
  })
  mocks.notify.mockResolvedValue(undefined)
})

afterEach(() => vi.unstubAllEnvs())

describe('GET /api/cron/ads-publish-reconcile', () => {
  it('stays disabled unless the publish feature flag is explicitly enabled', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '0')
    const response = await GET(request('Bearer cron-secret'))

    expect(response.status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated requests before invoking the RPC', async () => {
    const response = await GET(request('Bearer nope-secret'))

    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.notify).not.toHaveBeenCalled()
  })

  it('calls the stale reconciliation RPC and alerts for each returned request', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [
        { plan_id: PLAN_ID, publish_request_id: REQUEST_ID },
        { plan_id: '123e4567-e89b-42d3-a456-426614174003', publish_request_id: null },
      ],
      error: null,
    })

    const response = await GET(request('Bearer cron-secret'))

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('ads_reconcile_stale_google_ads_publishes', { p_batch: 100 })
    expect(mocks.notify).toHaveBeenCalledOnce()
    expect(mocks.notify).toHaveBeenCalledWith(PLAN_ID, REQUEST_ID, undefined, 'publish_stale_timeout')
    expect(await response.json()).toEqual({ ok: true, reconciled: 2, notificationsAttempted: 1 })
  })

  it('returns not_configured when the cron secret is absent', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const response = await GET(request('Bearer cron-secret'))

    expect(response.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('fails closed on RPC errors or malformed rows', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } })
    const errorResponse = await GET(request('Bearer cron-secret'))
    expect(errorResponse.status).toBe(500)
    expect(mocks.notify).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValueOnce({ data: [{ plan_id: 'not-a-uuid', publish_request_id: REQUEST_ID }], error: null })
    const malformedResponse = await GET(request('Bearer cron-secret'))
    expect(malformedResponse.status).toBe(500)
    expect(mocks.notify).not.toHaveBeenCalled()
  })
})
