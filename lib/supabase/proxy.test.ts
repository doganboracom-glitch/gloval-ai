import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}))

import { updateSession } from './proxy'
import { VERIFIED_USER_HEADERS } from './auth-context'

const user = {
  id: 'user-1',
  email: 'person@example.test',
  email_confirmed_at: '2025-01-01T00:00:00.000Z',
  created_at: '2025-01-01T00:00:00.000Z',
}

function request(path: string, method = 'GET', incomingHeaders?: HeadersInit) {
  const headers = new Headers({ host: 'gloval.ai' })
  new Headers(incomingHeaders).forEach((value, name) => headers.set(name, value))
  return new NextRequest(`https://gloval.ai${path}`, { method, headers })
}

const forgedVerifiedUserHeaders = {
  [VERIFIED_USER_HEADERS.verified]: '1',
  [VERIFIED_USER_HEADERS.id]: 'attacker-user',
  [VERIFIED_USER_HEADERS.email]: encodeURIComponent('admin@gloval.ai'),
  [VERIFIED_USER_HEADERS.emailConfirmedAt]: '2024-01-01T00:00:00.000Z',
  [VERIFIED_USER_HEADERS.createdAt]: '2024-01-01T00:00:00.000Z',
}

function expectVerifiedUserHeadersNotForwarded(response: Response) {
  const forwardedNames = (response.headers.get('x-middleware-override-headers') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  for (const name of Object.values(VERIFIED_USER_HEADERS)) {
    expect(forwardedNames).not.toContain(name)
    expect(response.headers.get(`x-middleware-request-${name}`)).toBeNull()
    expect(response.headers.get(name)).toBeNull()
  }
}

function statusError(status: number) {
  return Object.assign(new Error(`Auth returned ${status}`), { status })
}

beforeEach(() => {
  mocks.getUser.mockReset()
  mocks.from.mockReset()
  mocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { status: 'active' }, error: null }),
      }),
    }),
  })
})

describe('updateSession authentication availability', () => {
  it.each([408, 425, 429, 500, 503])(
    'returns 503 with Retry-After for HTTP %s on a protected route',
    async (status) => {
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: statusError(status) })

      const response = await updateSession(request('/dashboard'))

      expect(response.status).toBe(503)
      expect(response.headers.get('Retry-After')).toBe('5')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(response.headers.get('Location')).toBeNull()
    },
  )

  it.each([
    '/dashboard',
    '/editor/project-1',
    '/billing',
    '/ecommerce/project-1',
    '/ads/dashboard',
    '/support',
    '/settings',
    '/admin',
    '/admin/emails/preview',
  ])('blocks auth-gated route %s with 503 and never redirects during Auth throttling', async (path) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: statusError(429) })

    const response = await updateSession(request(path))

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('5')
    expect(response.headers.get('Location')).toBeNull()
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it.each(['/billing', '/billing/add-ons'])(
    'blocks payment-action POST %s before its page handler when Auth is unavailable',
    async (path) => {
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: statusError(429) })

      const response = await updateSession(request(path, 'POST'))

      expect(response.status).toBe(503)
      expect(response.headers.get('Retry-After')).toBe('5')
      expect(response.headers.get('Location')).toBeNull()
    },
  )

  it('returns 503 when the Auth request rejects at the network layer', async () => {
    mocks.getUser.mockRejectedValue(new TypeError('fetch failed'))

    const response = await updateSession(request('/dashboard'))

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('5')
    expect(response.headers.get('Location')).toBeNull()
  })

  it('Auth kesintisindeki herkese açık yanıtta sahte kimlik başlıklarını iletmez', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: statusError(429),
    })

    const response = await updateSession(request('/', 'GET', forgedVerifiedUserHeaders))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('Location')).toBeNull()
    expectVerifiedUserHeadersNotForwarded(response)
  })

  it('oturumsuz korumalı isteği girişe yönlendirirken sahte kimlik başlıklarını iletmez', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const response = await updateSession(
      request('/dashboard', 'GET', forgedVerifiedUserHeaders),
    )
    const location = new URL(response.headers.get('Location')!)

    expect(response.status).toBe(307)
    expect(location.pathname).toBe('/auth/login')
    expect(location.searchParams.get('next')).toBe('/dashboard')
    expectVerifiedUserHeadersNotForwarded(response)
  })

  it('e-posta doğrulama yönlendirmesinde sahte kimlik başlıklarını iletmez', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { ...user, email_confirmed_at: null } },
      error: null,
    })

    const response = await updateSession(
      request('/dashboard', 'GET', forgedVerifiedUserHeaders),
    )
    const location = new URL(response.headers.get('Location')!)

    expect(location.pathname).toBe('/auth/verify-email')
    expectVerifiedUserHeadersNotForwarded(response)
  })

  it('askıya alınmış hesap yönlendirmesinde sahte kimlik başlıklarını iletmez', async () => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null })
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { status: 'suspended' }, error: null }) }),
      }),
    })

    const response = await updateSession(
      request('/dashboard', 'GET', forgedVerifiedUserHeaders),
    )
    const location = new URL(response.headers.get('Location')!)

    expect(location.pathname).toBe('/account-suspended')
    expectVerifiedUserHeadersNotForwarded(response)
  })

  it('sahte kimlik alanlarının tümünü middleware tarafından doğrulanan kullanıcıyla ezer', async () => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null })

    const response = await updateSession(request('/', 'GET', forgedVerifiedUserHeaders))
    const expectedHeaders = {
      [VERIFIED_USER_HEADERS.verified]: '1',
      [VERIFIED_USER_HEADERS.id]: user.id,
      [VERIFIED_USER_HEADERS.email]: encodeURIComponent(user.email),
      [VERIFIED_USER_HEADERS.emailConfirmedAt]: user.email_confirmed_at,
      [VERIFIED_USER_HEADERS.createdAt]: user.created_at,
    }

    for (const [name, value] of Object.entries(expectedHeaders)) {
      expect(response.headers.get(`x-middleware-request-${name}`)).toBe(value)
      expect(response.headers.get(name)).toBeNull()
    }
  })
})
