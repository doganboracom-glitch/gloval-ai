import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), from: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/mail/admin-guard', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))

import { listStuckGoogleAdsPublishes } from '@/lib/admin/google-ads-publish-recovery'

const STUCK_ROW = {
  id: '123e4567-e89b-42d3-a456-426614174001',
  user_id: '123e4567-e89b-42d3-a456-426614174010',
  status: 'reconciling' as const,
  publish_request_id: '123e4567-e89b-42d3-a456-426614174002',
  publish_started_at: '2026-11-04T12:00:00.000Z',
  failure_reason: 'publish_stale_timeout',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '0')
  mocks.requireAdmin.mockResolvedValue({ userId: 'admin-user', email: 'admin@gloval.ai' })
})

afterEach(() => vi.unstubAllEnvs())

describe('listStuckGoogleAdsPublishes', () => {
  it('requires an admin and avoids database reads while publishing is disabled', async () => {
    await expect(listStuckGoogleAdsPublishes()).resolves.toEqual({ enabled: false, error: false, rows: [] })
    expect(mocks.requireAdmin).toHaveBeenCalledOnce()
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('queries only stale publishing/reconciling plans through the service-role client', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
    const query = {
      select: vi.fn(),
      in: vi.fn(),
      lt: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.in.mockReturnValue(query)
    query.lt.mockReturnValue(query)
    query.order.mockReturnValue(query)
    query.limit.mockResolvedValue({ data: [STUCK_ROW], error: null })
    mocks.from.mockReturnValue(query)

    await expect(listStuckGoogleAdsPublishes()).resolves.toEqual({
      enabled: true,
      error: false,
      rows: [STUCK_ROW],
    })
    expect(mocks.from).toHaveBeenCalledWith('ads_plans')
    expect(query.select).toHaveBeenCalledWith('id,user_id,status,publish_request_id,publish_started_at,failure_reason')
    expect(query.in).toHaveBeenCalledWith('status', ['publishing', 'reconciling'])
    expect(query.lt).toHaveBeenCalledWith('publish_started_at', expect.any(String))
    expect(query.order).toHaveBeenCalledWith('publish_started_at', { ascending: true })
    expect(query.limit).toHaveBeenCalledWith(100)
  })

  it('does not query before the admin guard succeeds', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
    mocks.requireAdmin.mockRejectedValue(new Error('not_admin'))

    await expect(listStuckGoogleAdsPublishes()).rejects.toThrow('not_admin')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
