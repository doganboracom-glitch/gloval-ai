// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'

vi.mock('@/lib/ads/google-route-utils', () => ({
  googleAdsFeatureEnabled: () => true,
  isSameOriginGoogleAdsPost: () => true,
  googleAdsRequestAccess: async () => ({ userId: USER_ID, decision: { canConnect: true } }),
  googleAdsJson: (body: unknown, status = 200) => NextResponse.json(body, { status }),
  googleAdsRedirect: (request: Request, values: Record<string, string>) => {
    const url = new URL('/ads/dashboard', request.url)
    for (const [k, v] of Object.entries(values)) url.searchParams.set(k, v)
    return NextResponse.redirect(url, 303)
  },
}))

import { POST } from '@/app/api/ads/meta/connect/route'

function post() {
  return POST(new Request('https://gloval.ai/api/ads/meta/connect', {
    method: 'POST',
    headers: { origin: 'https://gloval.ai' },
  }))
}

describe('POST /api/ads/meta/connect', () => {
  beforeEach(() => {
    vi.stubEnv('META_APP_ID', '123456789')
    vi.stubEnv('META_APP_SECRET', 'secret')
    vi.stubEnv('ADS_OAUTH_STATE_SECRET', 'x'.repeat(32))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('META_LOGIN_CONFIG_ID tanımlıyken config_id ile yönlendirir, scope göndermez', async () => {
    vi.stubEnv('META_LOGIN_CONFIG_ID', '987654321012')
    const response = await post()
    expect(response.status).toBe(303)
    const location = new URL(response.headers.get('location')!)
    expect(location.hostname).toBe('www.facebook.com')
    expect(location.searchParams.get('config_id')).toBe('987654321012')
    expect(location.searchParams.get('override_default_response_type')).toBe('true')
    expect(location.searchParams.get('response_type')).toBe('code')
    expect(location.searchParams.has('scope')).toBe(false)
    expect(response.cookies.getAll().length).toBe(1)
  })

  it('META_LOGIN_CONFIG_ID tanımsızken scope ile yönlendirir', async () => {
    vi.stubEnv('META_LOGIN_CONFIG_ID', '')
    const response = await post()
    expect(response.status).toBe(303)
    const location = new URL(response.headers.get('location')!)
    expect(location.searchParams.get('scope')).toBe('ads_read,business_management,pages_show_list,instagram_basic')
    expect(location.searchParams.has('config_id')).toBe(false)
    expect(location.searchParams.has('override_default_response_type')).toBe(false)
  })
})
