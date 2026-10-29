// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  scheduleWelcomeEmail: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchangeCodeForSession } }),
}))
vi.mock('@/lib/email-outbox', () => ({ scheduleWelcomeEmail: mocks.scheduleWelcomeEmail }))

import { GET } from './route'

function call(next: string | null) {
  const url = new URL('https://gloval.ai/auth/oauth-callback?code=abc')
  if (next !== null) url.searchParams.set('next', next)
  return GET(new NextRequest(url))
}

function target(response: Response) {
  return new URL(response.headers.get('location') ?? '')
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.exchangeCodeForSession.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
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
})
