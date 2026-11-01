import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setUnauthenticatedAuthState, setUnavailableAuthState, setVerifiedUserHeaders } from './auth-context'

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  createClient: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: mocks.headers }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))

import { AuthUnavailableError, getRequestUser, requireRequestUser } from './request-user'

const user = {
  id: 'trusted-user',
  email: 'trusted@example.test',
  email_confirmed_at: '2025-01-02T03:04:05.000Z',
  created_at: '2025-01-01T03:04:05.000Z',
}

function makeHeaders(withUser = false) {
  const requestHeaders = new Headers()
  if (withUser) setVerifiedUserHeaders(requestHeaders, user)
  return requestHeaders
}

beforeEach(() => {
  mocks.headers.mockReset().mockResolvedValue(makeHeaders())
  mocks.getUser.mockReset()
  mocks.createClient.mockReset().mockResolvedValue({ auth: { getUser: mocks.getUser } })
})

describe('getRequestUser', () => {
  it('uses the middleware-verified user without another Supabase Auth call', async () => {
    mocks.headers.mockResolvedValue(makeHeaders(true))

    await expect(getRequestUser()).resolves.toEqual({ kind: 'authenticated', user })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('uses middleware-authenticated outcomes without another Supabase Auth call', async () => {
    const signedOut = new Headers()
    setUnauthenticatedAuthState(signedOut)
    mocks.headers.mockResolvedValue(signedOut)
    await expect(getRequestUser()).resolves.toEqual({ kind: 'unauthenticated' })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.getUser).not.toHaveBeenCalled()

    const unavailable = new Headers()
    setUnavailableAuthState(unavailable)
    mocks.headers.mockResolvedValue(unavailable)
    await expect(getRequestUser()).resolves.toEqual({ kind: 'unavailable' })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('keeps a definite signed-out result separate from an Auth outage', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(getRequestUser()).resolves.toEqual({ kind: 'unauthenticated' })

    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error('rate limited'), { status: 429 }),
    })
    await expect(getRequestUser()).resolves.toEqual({ kind: 'unavailable' })
  })

  it('treats a thrown Auth lookup or request-context failure as unavailable', async () => {
    mocks.getUser.mockRejectedValue(new TypeError('fetch failed'))
    await expect(getRequestUser()).resolves.toEqual({ kind: 'unavailable' })

    mocks.headers.mockRejectedValueOnce(new Error('missing request context'))
    await expect(getRequestUser()).resolves.toEqual({ kind: 'unavailable' })
  })

  it('throws a distinct unavailable error rather than UNAUTHENTICATED', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error('service unavailable'), { status: 503 }),
    })

    await expect(requireRequestUser()).rejects.toBeInstanceOf(AuthUnavailableError)
    await expect(requireRequestUser()).rejects.not.toThrow('UNAUTHENTICATED')
  })
})
