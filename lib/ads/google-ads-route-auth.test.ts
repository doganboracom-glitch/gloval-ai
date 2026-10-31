import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))

import { requireGoogleAdsConnectUser } from '@/lib/ads/google-ads-route-auth'

const ALLOWED_USER = 'b0b25d6f-55be-4fa8-97a4-53619a2a1284'
const OTHER_USER = '058da5a9-43ca-4bb8-a537-b1e64c5099bd'

function authenticateAs(userId: string | null) {
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: userId ? { id: userId } : null },
        error: userId ? null : new Error('not authenticated'),
      }),
    },
  })
}

describe('Google Ads route access', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_ADS_CONNECT_ENABLED', '')
    vi.stubEnv('GOOGLE_ADS_CONNECT_ALLOWED_USER_IDS', '')
    mocks.createClient.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 404 without checking the session when the feature flag is disabled', async () => {
    authenticateAs(ALLOWED_USER)

    const access = await requireGoogleAdsConnectUser()

    expect(access.ok).toBe(false)
    if (!access.ok) expect(access.response.status).toBe(404)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('allows an authenticated UUID in the allowlist when enabled', async () => {
    vi.stubEnv('GOOGLE_ADS_CONNECT_ENABLED', 'true')
    vi.stubEnv('GOOGLE_ADS_CONNECT_ALLOWED_USER_IDS', ALLOWED_USER)
    authenticateAs(ALLOWED_USER)

    await expect(requireGoogleAdsConnectUser()).resolves.toEqual({ ok: true, userId: ALLOWED_USER })
  })

  it('returns 404 for an authenticated but non-allowlisted user', async () => {
    vi.stubEnv('GOOGLE_ADS_CONNECT_ENABLED', '1')
    vi.stubEnv('GOOGLE_ADS_CONNECT_ALLOWED_USER_IDS', ALLOWED_USER)
    authenticateAs(OTHER_USER)

    const access = await requireGoogleAdsConnectUser()

    expect(access.ok).toBe(false)
    if (!access.ok) expect(access.response.status).toBe(404)
  })

  it('returns 401 when enabled but no authenticated user is present', async () => {
    vi.stubEnv('GOOGLE_ADS_CONNECT_ENABLED', '1')
    vi.stubEnv('GOOGLE_ADS_CONNECT_ALLOWED_USER_IDS', ALLOWED_USER)
    authenticateAs(null)

    const access = await requireGoogleAdsConnectUser()

    expect(access.ok).toBe(false)
    if (!access.ok) expect(access.response.status).toBe(401)
  })
})
