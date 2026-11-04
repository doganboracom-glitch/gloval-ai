import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/mail/admin-guard', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { resolveStuckGoogleAdsPublish } from './actions'

const PLAN_ID = '123e4567-e89b-42d3-a456-426614174001'
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174002'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
  mocks.requireAdmin.mockResolvedValue({ userId: 'admin-user', email: 'admin@gloval.ai' })
  mocks.rpc.mockReturnValue({
    maybeSingle: async () => ({ data: { state: 'published', refunded: false, balance: 85 }, error: null }),
  })
})

afterEach(() => vi.unstubAllEnvs())

describe('resolveStuckGoogleAdsPublish', () => {
  it('requires an admin before checking the feature gate or touching the service-role client', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '0')
    mocks.requireAdmin.mockRejectedValue(new Error('not_admin'))

    await expect(resolveStuckGoogleAdsPublish({
      planId: PLAN_ID,
      requestId: REQUEST_ID,
      resolution: 'published',
      campaignId: '456789',
      confirmed: true,
    })).rejects.toThrow('not_admin')

    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not query the database while the publish feature is disabled', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '0')

    await expect(resolveStuckGoogleAdsPublish({
      planId: PLAN_ID,
      requestId: REQUEST_ID,
      resolution: 'published',
      campaignId: '456789',
      confirmed: true,
    })).resolves.toEqual({ ok: false, error: 'disabled' })

    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('validates the campaign ID and explicit confirmation before invoking the RPC', async () => {
    await expect(resolveStuckGoogleAdsPublish({
      planId: PLAN_ID,
      requestId: REQUEST_ID,
      resolution: 'published',
      campaignId: 'invalid',
      confirmed: true,
    })).resolves.toEqual({ ok: false, error: 'invalid_campaign_id' })
    await expect(resolveStuckGoogleAdsPublish({
      planId: PLAN_ID,
      requestId: REQUEST_ID,
      resolution: 'failed_refunded',
      confirmed: false,
    })).resolves.toEqual({ ok: false, error: 'invalid_request' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('calls the service-only resolver with the authenticated admin identity and revalidates the list', async () => {
    await expect(resolveStuckGoogleAdsPublish({
      planId: PLAN_ID,
      requestId: REQUEST_ID,
      resolution: 'published',
      campaignId: '456789',
      confirmed: true,
    })).resolves.toEqual({ ok: true, state: 'published', refunded: false })

    expect(mocks.rpc).toHaveBeenCalledWith('ads_resolve_google_ads_publish', {
      p_plan_id: PLAN_ID,
      p_request_id: REQUEST_ID,
      p_resolution: 'published',
      p_external_campaign_id: '456789',
      p_admin_email: 'admin@gloval.ai',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/ads-publishing')
  })

  it('reports the refund result for an admin-confirmed failed publish', async () => {
    mocks.rpc.mockReturnValueOnce({
      maybeSingle: async () => ({ data: { state: 'failed_refunded', refunded: true, balance: 100 }, error: null }),
    })

    await expect(resolveStuckGoogleAdsPublish({
      planId: PLAN_ID,
      requestId: REQUEST_ID,
      resolution: 'failed_refunded',
      confirmed: true,
    })).resolves.toEqual({ ok: true, state: 'failed_refunded', refunded: true })
  })
})
