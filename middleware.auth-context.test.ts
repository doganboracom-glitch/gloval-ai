import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, type NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  middlewareGetUser: vi.fn(),
  from: vi.fn(),
  serverHeaders: vi.fn(),
  resolveActiveDomainForHost: vi.fn(),
  getPublishedSlugForProjectId: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: mocks.middlewareGetUser },
    from: mocks.from,
  }),
}))
vi.mock('next/headers', () => ({ headers: mocks.serverHeaders }))
vi.mock('@/lib/custom-domains/service', () => ({
  resolveActiveDomainForHost: (host: string) => mocks.resolveActiveDomainForHost(host),
  getPublishedSlugForProjectId: (id: string) => mocks.getPublishedSlugForProjectId(id),
}))

import { middleware } from '@/middleware'
import {
  getAuthStateFromHeaders,
  getVerifiedUserFromHeaders,
  VERIFIED_USER_HEADERS,
} from '@/lib/supabase/auth-context'
import { getPageAuthState } from '@/lib/supabase/page-auth'
import { getRequestUser } from '@/lib/supabase/request-user'

const user = {
  id: 'trusted-user',
  email: 'trusted@example.test',
  email_confirmed_at: '2025-02-03T04:05:06.000Z',
  created_at: '2025-02-01T04:05:06.000Z',
}

const forgedHeaders = {
  [VERIFIED_USER_HEADERS.state]: 'authenticated',
  [VERIFIED_USER_HEADERS.verified]: '1',
  [VERIFIED_USER_HEADERS.id]: 'attacker-user',
  [VERIFIED_USER_HEADERS.email]: encodeURIComponent('admin@gloval.ai'),
  [VERIFIED_USER_HEADERS.emailConfirmedAt]: '2024-01-01T00:00:00.000Z',
  [VERIFIED_USER_HEADERS.createdAt]: '2024-01-01T00:00:00.000Z',
}

function request(path: string, method = 'GET') {
  const headers = new Headers({ host: 'gloval.ai' })
  for (const [name, value] of Object.entries(forgedHeaders)) {
    headers.set(name, value)
  }
  return new NextRequest(`https://gloval.ai${path}`, { headers, method })
}

function readForwardedRequestHeaders(response: NextResponse): Headers {
  const names = (response.headers.get('x-middleware-override-headers') ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  const forwarded = new Headers()

  for (const name of names) {
    const value = response.headers.get(`x-middleware-request-${name}`)
    if (value !== null) forwarded.set(name, value)
  }

  return forwarded
}

function statusError(status: number) {
  return Object.assign(new Error(`Auth returned ${status}`), { status })
}

function unavailablePageClient() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: statusError(429),
      }),
    },
  }
}

beforeEach(() => {
  mocks.middlewareGetUser.mockReset()
  mocks.from.mockReset()
  mocks.serverHeaders.mockReset()
  mocks.resolveActiveDomainForHost.mockReset().mockResolvedValue(null)
  mocks.getPublishedSlugForProjectId.mockReset().mockResolvedValue(null)
})

describe('middleware ile sayfa auth başlığı sınırı', () => {
  it('middleware kimlik doğrulama kesintisinde sahte kimliği iletmez; ikinci sorgu da kesilince sayfa erişilemez kalır', async () => {
    mocks.middlewareGetUser.mockResolvedValue({
      data: { user: null },
      error: statusError(429),
    })

    const response = await middleware(request('/'))
    const forwardedHeaders = readForwardedRequestHeaders(response)

    expect(response.status).toBe(200)
    expect(getVerifiedUserFromHeaders(forwardedHeaders)).toBeNull()
    expect(getAuthStateFromHeaders(forwardedHeaders)).toEqual({ kind: 'unavailable' })
    for (const name of Object.values(VERIFIED_USER_HEADERS).filter((header) => header !== VERIFIED_USER_HEADERS.state)) {
      expect(forwardedHeaders.has(name)).toBe(false)
    }

    mocks.serverHeaders.mockResolvedValue(forwardedHeaders)
    const pageClient = unavailablePageClient()
    await expect(getPageAuthState(pageClient as never)).resolves.toEqual({ kind: 'unavailable' })
    expect(pageClient.auth.getUser).not.toHaveBeenCalled()
  })

  it('korunan sayfada middleware kimlik doğrulama kesintisi sayfa sorgusundan önce 503 döndürür', async () => {
    mocks.middlewareGetUser.mockResolvedValue({
      data: { user: null },
      error: statusError(429),
    })

    const response = await middleware(request('/support'))

    expect(response.status).toBe(503)
    expect(response.headers.get('x-middleware-override-headers')).toBeNull()
    expect(mocks.serverHeaders).not.toHaveBeenCalled()
  })

  it('middleware kullanıcıyı doğruladığında bütün sahte alanları kendi kullanıcı bilgisiyle ezer', async () => {
    mocks.middlewareGetUser.mockResolvedValue({ data: { user }, error: null })

    const response = await middleware(request('/support'))
    const forwardedHeaders = readForwardedRequestHeaders(response)

    expect(response.status).toBe(200)
    expect(getVerifiedUserFromHeaders(forwardedHeaders)).toEqual(user)
    expect(forwardedHeaders.get(VERIFIED_USER_HEADERS.verified)).toBe('1')
    expect(forwardedHeaders.get(VERIFIED_USER_HEADERS.id)).toBe(user.id)
    expect(forwardedHeaders.get(VERIFIED_USER_HEADERS.email)).toBe(
      encodeURIComponent(user.email),
    )
    expect(forwardedHeaders.get(VERIFIED_USER_HEADERS.emailConfirmedAt)).toBe(
      user.email_confirmed_at,
    )
    expect(forwardedHeaders.get(VERIFIED_USER_HEADERS.createdAt)).toBe(user.created_at)

    mocks.serverHeaders.mockResolvedValue(forwardedHeaders)
    await expect(getPageAuthState(unavailablePageClient() as never)).resolves.toEqual({
      kind: 'authenticated',
      user,
    })
  })

  it('POST sunucu eyleminde istemcinin sahte kimliğini reddedip middleware kimliğini kullanır', async () => {
    mocks.middlewareGetUser.mockResolvedValue({ data: { user }, error: null })

    const response = await middleware(request('/support/new', 'POST'))
    const forwardedHeaders = readForwardedRequestHeaders(response)

    expect(response.status).toBe(200)
    expect(forwardedHeaders.get(VERIFIED_USER_HEADERS.id)).toBe(user.id)
    expect(forwardedHeaders.get(VERIFIED_USER_HEADERS.id)).not.toBe('attacker-user')
    expect(getVerifiedUserFromHeaders(forwardedHeaders)).toEqual(user)

    mocks.serverHeaders.mockResolvedValue(forwardedHeaders)
    await expect(getRequestUser()).resolves.toEqual({ kind: 'authenticated', user })
    expect(mocks.middlewareGetUser).toHaveBeenCalledTimes(1)
  })

  it('homepage reads the verified middleware identity without a second Auth request', async () => {
    mocks.middlewareGetUser.mockResolvedValue({ data: { user }, error: null })

    const response = await middleware(request('/'))
    const forwardedHeaders = readForwardedRequestHeaders(response)

    mocks.serverHeaders.mockResolvedValue(forwardedHeaders)
    await expect(getRequestUser()).resolves.toEqual({ kind: 'authenticated', user })
    expect(mocks.middlewareGetUser).toHaveBeenCalledTimes(1)
  })
})
