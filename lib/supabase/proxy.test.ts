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

const user = {
  id: 'user-1',
  email: 'person@example.test',
  email_confirmed_at: '2025-01-01T00:00:00.000Z',
  created_at: '2025-01-01T00:00:00.000Z',
}

function request(path: string) {
  return new NextRequest(`https://gloval.ai${path}`, {
    headers: { host: 'gloval.ai' },
  })
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

  it('returns 503 when the Auth request rejects at the network layer', async () => {
    mocks.getUser.mockRejectedValue(new TypeError('fetch failed'))

    const response = await updateSession(request('/dashboard'))

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('5')
    expect(response.headers.get('Location')).toBeNull()
  })

  it('passes public requests through during a temporary Auth failure', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: statusError(429),
    })

    const response = await updateSession(request('/'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('Location')).toBeNull()
  })

  it('redirects a protected route only when there is no valid session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const response = await updateSession(request('/dashboard'))
    const location = new URL(response.headers.get('Location')!)

    expect(response.status).toBe(307)
    expect(location.pathname).toBe('/auth/login')
    expect(location.searchParams.get('next')).toBe('/dashboard')
  })

  it('forwards a middleware-verified identity only on the internal request', async () => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null })

    const response = await updateSession(request('/'))

    expect(response.headers.get('x-middleware-request-x-gloval-auth-verified')).toBe('1')
    expect(response.headers.get('x-middleware-request-x-gloval-auth-user-id')).toBe('user-1')
    expect(response.headers.get('x-gloval-auth-verified')).toBeNull()
  })
})
