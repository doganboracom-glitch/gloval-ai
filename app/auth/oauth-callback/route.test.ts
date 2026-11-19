// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { REFERRAL_COOKIE_NAME, REFERRAL_SIGNUP_INTENT_COOKIE_NAME } from '@/lib/referrals/core'
import { ATTRIBUTION_COOKIE } from '@/lib/attribution'
import {
  OAUTH_SIGNUP_EVENT_PARAM,
  OAUTH_SIGNUP_FLOW_PARAM,
  PENDING_OAUTH_SIGNUP_COOKIE,
} from '@/lib/analytics-events'

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  scheduleWelcomeEmail: vi.fn(),
  saveOAuthReferralAtSignup: vi.fn(),
  saveSignupAttribution: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession } }),
}))
vi.mock('@/lib/email-outbox', () => ({ scheduleWelcomeEmail: mocks.scheduleWelcomeEmail }))
vi.mock('@/lib/referrals/service', () => ({ saveOAuthReferralAtSignup: mocks.saveOAuthReferralAtSignup }))
vi.mock('@/lib/signup-attribution', () => ({ saveSignupAttribution: mocks.saveSignupAttribution }))

import { GET } from './route'

function call(next: string | null, cookieHeader?: string, signupFlow = false) {
  const url = new URL('https://gloval.ai/auth/oauth-callback?code=abc')
  if (next !== null) url.searchParams.set('next', next)
  if (signupFlow) url.searchParams.set(OAUTH_SIGNUP_FLOW_PARAM, '1')
  const headers = new Headers()
  if (cookieHeader) headers.set('cookie', cookieHeader)
  return GET(new NextRequest(url, { headers }))
}

function target(response: Response) {
  return new URL(response.headers.get('location') ?? '')
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.exchangeCodeForSession.mockResolvedValue({
    data: { user: { id: 'u1', created_at: '2026-11-03T12:00:01.000Z' } },
    error: null,
  })
  mocks.saveOAuthReferralAtSignup.mockResolvedValue(true)
})

describe('GET /auth/oauth-callback (Google return)', () => {
  it.each(['/dashboard', '/billing', '/editor/abc-123', '/dashboard/domains?buy=marka.com'])(
    'keeps the legitimate path %s on gloval.ai',
    async (path) => {
      const out = target(await call(path))
      expect(out.origin).toBe('https://gloval.ai')
      expect(`${out.pathname}${out.search}`).toBe(path)
    },
  )

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', '/\t/evil.com', null])(
    'falls back to /dashboard for %j',
    async (value) => {
      const out = target(await call(value))
      expect(out.origin).toBe('https://gloval.ai')
      expect(out.pathname).toBe('/dashboard')
    },
  )

  it('passes the server-signed intent and first-touch cookie only after code exchange', async () => {
    const intentToken = 'signed-one-time-intent'
    const referralToken = 'signed-first-touch'
    const response = await call(
      '/dashboard',
      `${REFERRAL_SIGNUP_INTENT_COOKIE_NAME}=${intentToken}; ${REFERRAL_COOKIE_NAME}=${referralToken}`,
    )

    expect(mocks.saveOAuthReferralAtSignup).toHaveBeenCalledWith({
      userId: 'u1',
      userCreatedAt: '2026-11-03T12:00:01.000Z',
      intentToken,
      referralCookie: referralToken,
    })
    expect(mocks.scheduleWelcomeEmail).toHaveBeenCalledWith({
      id: 'u1',
      created_at: '2026-11-03T12:00:01.000Z',
    })
    expect(response.cookies.get(REFERRAL_SIGNUP_INTENT_COOKIE_NAME)).toMatchObject({
      value: '',
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    })
  })

  it('saves consented first-touch data for a new OAuth account and signals its signup event', async () => {
    const startedAt = Date.now() - 3_000
    const attribution = {
      params: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'launch', gclid: true, fbclid: false },
      landing_path: '/paketler',
      captured_at: Date.now() - 10_000,
    }
    mocks.exchangeCodeForSession.mockResolvedValueOnce({
      data: { user: { id: 'new-user', created_at: new Date(startedAt + 500).toISOString() } },
      error: null,
    })

    const response = await call(
      '/dashboard',
      `${PENDING_OAUTH_SIGNUP_COOKIE}=${startedAt}; ${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(attribution))}`,
      true,
    )
    const destination = target(response)

    expect(mocks.saveSignupAttribution).toHaveBeenCalledWith({ userId: 'new-user', attribution })
    expect(destination.pathname).toBe('/dashboard')
    expect(destination.searchParams.get(OAUTH_SIGNUP_EVENT_PARAM)).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(response.cookies.get(PENDING_OAUTH_SIGNUP_COOKIE)?.maxAge).toBe(0)
  })

  it('does not assign on an unsuccessful code exchange and clears the intent', async () => {
    mocks.exchangeCodeForSession.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'exchange failed' },
    })
    const response = await call('/dashboard', `${REFERRAL_SIGNUP_INTENT_COOKIE_NAME}=signed-intent`)

    expect(mocks.saveOAuthReferralAtSignup).not.toHaveBeenCalled()
    expect(response.cookies.get(REFERRAL_SIGNUP_INTENT_COOKIE_NAME)?.maxAge).toBe(0)
  })
})
