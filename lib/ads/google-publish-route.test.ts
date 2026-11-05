import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  checkRateLimit: vi.fn(),
  googleAdsConnectAllowed: vi.fn(),
  googleAdsFeatureEnabled: vi.fn(),
  isSameOriginGoogleAdsPost: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/mail/admin-guard', () => ({ getAdminUser: mocks.getAdminUser }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }))
vi.mock('@/lib/ads/google-route-utils', () => ({
  googleAdsConnectAllowed: mocks.googleAdsConnectAllowed,
  googleAdsFeatureEnabled: mocks.googleAdsFeatureEnabled,
  googleAdsJson: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
  googleAdsNotFound: () => new Response(null, { status: 404 }),
  googleAdsUserId: vi.fn(),
  isSameOriginGoogleAdsPost: mocks.isSameOriginGoogleAdsPost,
}))

import { requireGoogleAdsValidateOnlyTestRequest } from '@/lib/ads/google-publish-route'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const request = () => new Request('https://gloval.example/api/ads/google/validate-only-test', { method: 'POST' })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

beforeEach(() => {
  vi.stubEnv('GOOGLE_ADS_VALIDATE_ONLY_TEST_ENABLED', '1')
  mocks.getAdminUser.mockResolvedValue({ userId: USER_ID, email: 'admin@gloval.example' })
  mocks.checkRateLimit.mockReturnValue({ allowed: true })
  mocks.googleAdsConnectAllowed.mockReturnValue(true)
  mocks.googleAdsFeatureEnabled.mockReturnValue(true)
  mocks.isSameOriginGoogleAdsPost.mockReturnValue(true)
})

describe('Google Ads validate-only test gate', () => {
  it('allows an admin with a Google Ads connection while live publishing stays disabled', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '0')

    const gate = await requireGoogleAdsValidateOnlyTestRequest(request())

    expect(gate).toEqual({ userId: USER_ID })
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(`google-ads-validate-only-test:${USER_ID}`, 5, 60_000)
  })

  it('fails closed when the separate environment flag is absent', async () => {
    vi.stubEnv('GOOGLE_ADS_VALIDATE_ONLY_TEST_ENABLED', '')

    const gate = await requireGoogleAdsValidateOnlyTestRequest(request())

    expect('response' in gate && gate.response.status).toBe(404)
    expect(mocks.getAdminUser).not.toHaveBeenCalled()
  })

  it('fails closed for non-admin users even when the environment flag is enabled', async () => {
    mocks.getAdminUser.mockResolvedValue(null)

    const gate = await requireGoogleAdsValidateOnlyTestRequest(request())

    expect('response' in gate && gate.response.status).toBe(404)
  })

  it('rejects cross-origin requests and users without Google Ads connection access', async () => {
    mocks.isSameOriginGoogleAdsPost.mockReturnValue(false)
    const csrfGate = await requireGoogleAdsValidateOnlyTestRequest(request())
    expect('response' in csrfGate && csrfGate.response.status).toBe(403)

    mocks.isSameOriginGoogleAdsPost.mockReturnValue(true)
    mocks.googleAdsConnectAllowed.mockReturnValue(false)
    const connectionGate = await requireGoogleAdsValidateOnlyTestRequest(request())
    expect('response' in connectionGate && connectionGate.response.status).toBe(404)
  })
})
