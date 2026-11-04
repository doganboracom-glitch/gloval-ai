import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const gateState = vi.hoisted(() => ({
  featureEnabled: true,
  connectAllowed: true,
  sameOrigin: true,
  userId: '550e8400-e29b-41d4-a716-446655440000' as string | null,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/ads/google-route-utils', () => ({
  googleAdsFeatureEnabled: () => gateState.featureEnabled,
  googleAdsConnectAllowed: () => gateState.connectAllowed,
  googleAdsUserId: async () => gateState.userId,
  isSameOriginGoogleAdsPost: () => gateState.sameOrigin,
  googleAdsNotFound: () => new Response(null, { status: 404 }),
  googleAdsJson: (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }),
}))

import { GET as listPlans, POST as createPlan, PATCH as updatePlan } from '@/app/api/ads/google/plans/route'
import { POST as approvePlan } from '@/app/api/ads/google/approval/route'
import { POST as publishPlan } from '@/app/api/ads/google/publish/route'
import { GET as getManagement, POST as updateManagement } from '@/app/api/ads/google/management/route'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'

function request(method: string, path: string) {
  return new Request(`https://gloval.test${path}`, {
    method,
    headers: { origin: 'https://gloval.test' },
  })
}

beforeEach(() => {
  gateState.featureEnabled = true
  gateState.connectAllowed = true
  gateState.sameOrigin = true
  gateState.userId = USER_ID
})

afterEach(() => vi.unstubAllEnvs())

describe('Google Ads E2 route gates', () => {
  it('returns 404 from every new plan, approval, publish, and management surface while publishing is disabled', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '0')
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS', USER_ID)

    const responses = await Promise.all([
      listPlans(request('GET', '/api/ads/google/plans')),
      createPlan(request('POST', '/api/ads/google/plans')),
      updatePlan(request('PATCH', '/api/ads/google/plans')),
      approvePlan(request('POST', '/api/ads/google/approval')),
      publishPlan(request('POST', '/api/ads/google/publish')),
      getManagement(request('GET', '/api/ads/google/management?planId=local-fixture')),
      updateManagement(request('POST', '/api/ads/google/management')),
    ])

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 404, 404])
  })

  it('returns 404 when the publish flag is enabled but the user is not in its allowlist', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS', '')

    await expect(publishPlan(request('POST', '/api/ads/google/publish'))).resolves.toMatchObject({ status: 404 })
  })

  it('rejects cross-origin writes before reaching the route handler', async () => {
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ENABLED', '1')
    vi.stubEnv('GOOGLE_ADS_PUBLISH_ALLOWED_USER_IDS', USER_ID)
    gateState.sameOrigin = false

    const response = await publishPlan(request('POST', '/api/ads/google/publish'))
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: 'csrf_failed' })
  })
})
