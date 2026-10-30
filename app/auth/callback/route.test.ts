// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  scheduleWelcomeEmail: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      verifyOtp: mocks.verifyOtp,
      signOut: mocks.signOut,
    },
  }),
}))
vi.mock('@/lib/email-outbox', () => ({ scheduleWelcomeEmail: mocks.scheduleWelcomeEmail }))

import { GET } from './route'

const DRAFT_TOKEN = 'a'.repeat(43)

function call(next: string | null, extra = '') {
  const url = new URL(`https://gloval.ai/auth/callback?code=abc${extra}`)
  if (next !== null) url.searchParams.set('next', next)
  return GET(new NextRequest(url))
}

function target(response: Response) {
  return new URL(response.headers.get('location') ?? '')
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  mocks.signOut.mockResolvedValue({ error: null })
})

describe('GET /auth/callback (email verification / password reset)', () => {
  it.each(['/dashboard', '/billing', '/editor/abc-123'])('carries the legitimate path %s to /auth/verified', async (path) => {
    const out = target(await call(path))
    expect(out.origin).toBe('https://gloval.ai')
    expect(out.pathname).toBe('/auth/verified')
    expect(out.searchParams.get('next')).toBe(path)
  })

  it.each(['//evil.com', 'https://evil.com', '/\\evil.com', '/\t/evil.com', null])(
    'replaces %j with /dashboard',
    async (value) => {
      const out = target(await call(value))
      expect(out.origin).toBe('https://gloval.ai')
      expect(out.searchParams.get('next')).toBe('/dashboard')
    },
  )

  it('password reset still lands on /auth/reset-password', async () => {
    const out = target(await call('/auth/reset-password', '&type=recovery'))
    expect(out.origin).toBe('https://gloval.ai')
    expect(out.pathname).toBe('/auth/reset-password')
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('signs out and shows the success screen with a draft instead of resuming', async () => {
    const out = target(await call('/dashboard', `&draft=${DRAFT_TOKEN}`))
    expect(out.pathname).toBe('/auth/verified')
    expect(out.searchParams.get('next')).toBe(`/auth/resume?draft=${DRAFT_TOKEN}`)
    expect(mocks.signOut).toHaveBeenCalledOnce()
  })

  describe('code verifier missing (opened on another browser or device)', () => {
    const verifierMissing = {
      name: 'AuthPKCECodeVerifierMissingError',
      code: 'pkce_code_verifier_not_found',
      status: 400,
    }

    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: verifierMissing })
    })

    it('redirects to /auth/verified without an error page, session or welcome email', async () => {
      const out = target(await call('/billing'))
      expect(out.pathname).toBe('/auth/verified')
      expect(out.searchParams.get('next')).toBe('/billing')
      expect(mocks.signOut).not.toHaveBeenCalled()
      expect(mocks.scheduleWelcomeEmail).not.toHaveBeenCalled()
    })

    it('also handles a thrown error and carries the draft through login', async () => {
      mocks.exchangeCodeForSession.mockRejectedValue(verifierMissing)
      const out = target(await call('/dashboard', `&draft=${DRAFT_TOKEN}`))
      expect(out.pathname).toBe('/auth/verified')
      expect(out.searchParams.get('next')).toBe(`/auth/resume?draft=${DRAFT_TOKEN}`)
    })

    it('does not mask other exchange failures', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mocks.exchangeCodeForSession.mockResolvedValue({
        data: { user: null },
        error: { code: 'flow_state_expired', status: 400 },
      })
      expect(target(await call('/dashboard')).pathname).toBe('/auth/error')
    })

    it('keeps password reset on the error page', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const out = target(await call('/auth/reset-password', '&type=recovery'))
      expect(out.pathname).toBe('/auth/error')
    })
  })
})
