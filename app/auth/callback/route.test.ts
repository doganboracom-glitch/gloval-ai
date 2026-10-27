// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const DRAFT_TOKEN = 'b'.repeat(43)

function location(response: Response) {
  const value = response.headers.get('location')
  if (!value) throw new Error('Expected a redirect location')
  return new URL(value)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null })
  mocks.verifyOtp.mockResolvedValue({ error: null })
  mocks.signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /auth/callback', () => {
  it('continues to accept existing PKCE links and keeps the draft session', async () => {
    const request = new NextRequest(
      `https://gloval.ai/auth/callback?code=legacy-pkce-code&draft=${DRAFT_TOKEN}`,
    )

    const response = await GET(request)

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('legacy-pkce-code')
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(location(response).pathname).toBe('/auth/resume')
    expect(location(response).searchParams.get('draft')).toBe(DRAFT_TOKEN)
  })

  it('logs a safe Supabase diagnostic and keeps the draft for login fallback', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: { code: 'code_verifier_not_found', status: 400, message: 'private@example.com' },
    })
    const request = new NextRequest(
      `https://gloval.ai/auth/callback?code=legacy-pkce-code&draft=${DRAFT_TOKEN}`,
    )

    const response = await GET(request)

    expect(log).toHaveBeenCalledWith('[auth callback] Supabase Auth operation failed', {
      code: 'code_verifier_not_found',
      status: 400,
    })
    expect(JSON.stringify(log.mock.calls)).not.toContain('private@example.com')
    expect(location(response).pathname).toBe('/auth/error')
    expect(location(response).searchParams.get('draft')).toBe(DRAFT_TOKEN)
  })
})
