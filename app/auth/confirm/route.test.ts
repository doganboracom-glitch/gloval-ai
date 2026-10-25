// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      verifyOtp: mocks.verifyOtp,
      signOut: mocks.signOut,
    },
  }),
}))

import { GET } from './route'

const DRAFT_TOKEN = 'a'.repeat(43)

function requestWith(params: Record<string, string>) {
  const url = new URL('/auth/confirm', 'https://gloval.ai')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return new NextRequest(url)
}

function location(response: Response) {
  const value = response.headers.get('location')
  if (!value) throw new Error('Expected a redirect location')
  return new URL(value)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.verifyOtp.mockResolvedValue({ error: null })
  mocks.signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /auth/confirm', () => {
  it('verifies a signup token hash without a PKCE verifier and resumes the draft', async () => {
    const response = await GET(
      requestWith({ token_hash: 'opaque-token-hash', type: 'signup', draft: DRAFT_TOKEN }),
    )

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'opaque-token-hash',
      type: 'signup',
    })
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(location(response).pathname).toBe('/auth/resume')
    expect(location(response).searchParams.get('draft')).toBe(DRAFT_TOKEN)
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('signs out after a non-draft email confirmation and keeps the safe next path', async () => {
    const response = await GET(
      requestWith({ token_hash: 'opaque-token-hash', type: 'signup', next: '/settings' }),
    )

    expect(mocks.signOut).toHaveBeenCalledOnce()
    expect(location(response).pathname).toBe('/auth/verified')
    expect(location(response).searchParams.get('next')).toBe('/settings')
  })

  it('preserves a valid nested draft when the supplied type is not supported', async () => {
    const nestedNext = `/auth/resume?draft=${DRAFT_TOKEN}`
    const response = await GET(
      requestWith({ token_hash: 'opaque-token-hash', type: 'magiclink', next: nestedNext }),
    )

    expect(mocks.verifyOtp).not.toHaveBeenCalled()
    expect(location(response).pathname).toBe('/auth/error')
    expect(location(response).searchParams.get('draft')).toBe(DRAFT_TOKEN)
  })

  it('logs only the Supabase error code and status while preserving the draft fallback', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.verifyOtp.mockResolvedValue({
      error: { code: 'otp_expired', status: 400, message: 'private@example.com token details' },
    })

    const response = await GET(
      requestWith({ token_hash: 'opaque-token-hash', type: 'signup', draft: DRAFT_TOKEN }),
    )

    expect(log).toHaveBeenCalledWith('[auth confirm] Supabase Auth operation failed', {
      code: 'otp_expired',
      status: 400,
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('private@example.com')
    expect(location(response).pathname).toBe('/auth/error')
    expect(location(response).searchParams.get('draft')).toBe(DRAFT_TOKEN)
  })
})
