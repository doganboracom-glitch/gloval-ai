// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  REFERRAL_SIGNUP_INTENT_COOKIE_NAME,
  type ReferralSignupSource,
} from '@/lib/referrals/core'

const { createSignupIntentForReferral } = vi.hoisted(() => ({
  createSignupIntentForReferral: vi.fn(),
}))

vi.mock('@/lib/referrals/service', () => ({ createSignupIntentForReferral }))

import { POST } from './route'

const COOKIE_SECRET = 'cookie-secret-0123456789-abcdefghijkl'
const CLICK_SECRET = 'click-secret-0123456789-abcdefghijkl'

function makeRequest(source: ReferralSignupSource | 'login', cookie?: string) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (cookie) headers.set('cookie', cookie)
  headers.set('x-vercel-forwarded-for', '203.0.113.42')
  return new NextRequest('https://gloval.ai/api/referrals/signup-intent', {
    method: 'POST',
    headers,
    body: JSON.stringify({ source }),
  })
}

function enableReferrals() {
  vi.stubEnv('REFERRAL_ENABLED', '1')
  vi.stubEnv('REFERRAL_COOKIE_HMAC_ACTIVE_VERSION', 'v1')
  vi.stubEnv('REFERRAL_COOKIE_HMAC_KEY_V1', COOKIE_SECRET)
  vi.stubEnv('REFERRAL_CLICK_HMAC_KEY_V1', CLICK_SECRET)
}

beforeEach(() => {
  vi.clearAllMocks()
  createSignupIntentForReferral.mockResolvedValue('signed-intent-token')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/referrals/signup-intent', () => {
  it('is a no-op when the feature flag is off', async () => {
    vi.stubEnv('REFERRAL_ENABLED', '0')
    const response = await POST(makeRequest('email', 'gloval_referral=signed-referral'))

    expect(response.status).toBe(204)
    expect(response.cookies.getAll()).toHaveLength(0)
    expect(createSignupIntentForReferral).not.toHaveBeenCalled()
  })

  it('issues a short-lived secure intent cookie for email signup', async () => {
    enableReferrals()
    const response = await POST(makeRequest('email', 'gloval_referral=signed-referral'))
    const cookie = response.cookies.get(REFERRAL_SIGNUP_INTENT_COOKIE_NAME)

    expect(response.status).toBe(204)
    expect(createSignupIntentForReferral).toHaveBeenCalledWith({
      source: 'email',
      referralCookie: 'signed-referral',
      ipAddress: '203.0.113.42',
    })
    expect(cookie).toMatchObject({
      value: 'signed-intent-token',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    })
    expect(cookie?.domain).toBeUndefined()
    expect(cookie?.maxAge).toBe(600)
  })

  it('clears a stale intent on login without creating another one', async () => {
    enableReferrals()
    const response = await POST(makeRequest('login', `${REFERRAL_SIGNUP_INTENT_COOKIE_NAME}=stale`))
    const cookie = response.cookies.get(REFERRAL_SIGNUP_INTENT_COOKIE_NAME)

    expect(response.status).toBe(204)
    expect(createSignupIntentForReferral).not.toHaveBeenCalled()
    expect(cookie).toMatchObject({ value: '', maxAge: 0, httpOnly: true, secure: true })
  })
})
