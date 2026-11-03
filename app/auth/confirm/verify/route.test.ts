// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  scheduleWelcomeEmail: vi.fn(),
  markReferralVerifiedForUser: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      verifyOtp: mocks.verifyOtp,
      signOut: mocks.signOut,
    },
  }),
}))

vi.mock('@/lib/email-outbox', () => ({ scheduleWelcomeEmail: mocks.scheduleWelcomeEmail }))
vi.mock('@/lib/referrals/service', () => ({
  markReferralVerifiedForUser: mocks.markReferralVerifiedForUser,
}))

import { POST } from './route'

const DRAFT_TOKEN = 'a'.repeat(43)

function postForm(fields: Record<string, string>) {
  const body = new URLSearchParams(fields)
  return new NextRequest('https://gloval.ai/auth/confirm/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
}

function location(response: Response) {
  const value = response.headers.get('location')
  if (!value) throw new Error('Expected a redirect location')
  return new URL(value)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.verifyOtp.mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null })
  mocks.signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /auth/confirm/verify', () => {
  it('verifies only after form submission and, with a draft, shows the success screen instead of resuming', async () => {
    const response = await POST(
      postForm({ token_hash: 'opaque-token-hash', type: 'signup', draft: DRAFT_TOKEN, next: '' }),
    )

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'opaque-token-hash',
      type: 'signup',
    })
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.markReferralVerifiedForUser).toHaveBeenCalledWith('verified-user')
    expect(response.status).toBe(303)

    expect(location(response).pathname).toBe('/auth/verified')
    expect(location(response).searchParams.get('next')).toBe(`/auth/resume?draft=${DRAFT_TOKEN}`)
  })

  it('handles empty draft and next as a normal, non-draft confirmation', async () => {
    const response = await POST(
      postForm({ token_hash: 'opaque-token-hash', type: 'signup', draft: '', next: '' }),
    )

    expect(mocks.verifyOtp).toHaveBeenCalledOnce()
    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(mocks.markReferralVerifiedForUser).toHaveBeenCalledWith('verified-user')
    expect(response.status).toBe(303)
    expect(location(response).pathname).toBe('/auth/verified')
    expect(location(response).searchParams.get('next')).toBe('/dashboard')
    expect(location(response).searchParams.has('draft')).toBe(false)
  })

  it('verifies recovery tokens on the server and redirects to a fixed password-reset path without signing out', async () => {
    const response = await POST(
      postForm({
        token_hash: 'one-time-recovery-token',
        type: 'recovery',
        draft: DRAFT_TOKEN,
        next: 'https://attacker.example',
      }),
    )
    const destination = location(response)

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'one-time-recovery-token',
      type: 'recovery',
    })
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.scheduleWelcomeEmail).not.toHaveBeenCalled()
    expect(mocks.markReferralVerifiedForUser).not.toHaveBeenCalled()
    expect(response.status).toBe(303)
    expect(destination.origin).toBe('https://gloval.ai')
    expect(destination.pathname).toBe('/auth/reset-password')
    expect(destination.search).toBe('')
    expect(destination.toString()).not.toContain('one-time-recovery-token')
  })

  it('routes expired recovery tokens to a recovery-specific error without carrying secrets', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.verifyOtp.mockResolvedValue({
      error: { code: 'otp_expired', status: 400, message: 'token one-time-recovery-token' },
    })

    const response = await POST(
      postForm({
        token_hash: 'one-time-recovery-token',
        type: 'recovery',
        email: 'private@example.com',
        next: 'https://attacker.example',
      }),
    )
    const destination = location(response)

    expect(destination.pathname).toBe('/auth/error')
    expect(destination.searchParams.get('reason')).toBe('recovery')
    expect(destination.searchParams.has('token_hash')).toBe(false)
    expect(destination.searchParams.has('email')).toBe(false)
    expect(destination.searchParams.has('draft')).toBe(false)
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.scheduleWelcomeEmail).not.toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain('one-time-recovery-token')
    expect(JSON.stringify(log.mock.calls)).not.toContain('private@example.com')
  })

  it('preserves a valid nested draft if the direct draft field is empty', async () => {
    const response = await POST(
      postForm({
        token_hash: 'opaque-token-hash',
        type: 'signup',
        draft: '',
        next: `/auth/resume?draft=${DRAFT_TOKEN}`,
      }),
    )

    expect(location(response).pathname).toBe('/auth/verified')
    expect(location(response).searchParams.get('next')).toBe(`/auth/resume?draft=${DRAFT_TOKEN}`)
  })

  it('does not verify an unsupported type and logs only the Supabase code and status on failure', async () => {
    const invalid = await POST(
      postForm({ token_hash: 'opaque-token-hash', type: 'magiclink', draft: DRAFT_TOKEN, next: '' }),
    )
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
    expect(location(invalid).pathname).toBe('/auth/error')
    expect(location(invalid).searchParams.get('draft')).toBe(DRAFT_TOKEN)

    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.verifyOtp.mockResolvedValue({
      error: { code: 'otp_expired', status: 400, message: 'private@example.com token details' },
    })
    const failed = await POST(
      postForm({ token_hash: 'opaque-token-hash', type: 'signup', draft: DRAFT_TOKEN, next: '' }),
    )

    expect(log).toHaveBeenCalledWith('[auth confirm] Supabase Auth operation failed', {
      code: 'otp_expired',
      status: 400,
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('private@example.com')
    expect(location(failed).pathname).toBe('/auth/error')
    expect(location(failed).searchParams.get('draft')).toBe(DRAFT_TOKEN)
  })

  it('decodes a double-encoded internal next path before redirecting', async () => {
    const response = await POST(
      postForm({
        token_hash: 'opaque-token-hash',
        type: 'signup',
        draft: '',
        next: '%252Fdashboard',
      }),
    )

    expect(location(response).pathname).toBe('/auth/verified')
    expect(location(response).searchParams.get('next')).toBe('/dashboard')
  })

  it.each(['//attacker.example', 'https://attacker.example', '%252F%252Fattacker.example'])(
    'rejects open redirect target %s',
    async (next) => {
      const response = await POST(
        postForm({ token_hash: 'opaque-token-hash', type: 'signup', draft: '', next }),
      )

      expect(location(response).pathname).toBe('/auth/verified')
      expect(location(response).searchParams.get('next')).toBe('/dashboard')
    },
  )
})
