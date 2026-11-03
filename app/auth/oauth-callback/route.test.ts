// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { REFERRAL_COOKIE_NAME, REFERRAL_SIGNUP_INTENT_COOKIE_NAME } from '@/lib/referrals/core'

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  scheduleWelcomeEmail: vi.fn(),
  saveOAuthReferralAtSignup: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession } }),
}))
vi.mock('@/lib/email-outbox', () => ({ scheduleWelcomeEmail: mocks.scheduleWelcomeEmail }))
vi.mock('@/lib/referrals/service', () => ({ saveOAuthReferralAtSignup: mocks.saveOAuthReferralAtSignup }))

import { GET } from './route'

function call(next: string | null, cookieHeader?: string) {
  const url = new URL('https://gloval.ai/auth/oauth-callback?code=abc')
  if (next !== null) url.searchParams.set('next', next)
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
