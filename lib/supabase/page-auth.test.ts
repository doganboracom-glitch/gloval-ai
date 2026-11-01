import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setVerifiedUserHeaders } from './auth-context'
import { getPageAuthState } from './page-auth'

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  createClient: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: mocks.headers }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))

const user = {
  id: 'user-1',
  email: 'person@example.test',
  email_confirmed_at: '2025-01-01T00:00:00.000Z',
  created_at: '2025-01-01T00:00:00.000Z',
}

beforeEach(() => {
  mocks.headers.mockReset().mockResolvedValue(new Headers())
  mocks.getUser.mockReset()
  mocks.createClient.mockReset().mockResolvedValue({ auth: { getUser: mocks.getUser } })
})

describe('getPageAuthState', () => {
  it('uses middleware-verified context without a second Auth lookup', async () => {
    const requestHeaders = new Headers()
    setVerifiedUserHeaders(requestHeaders, user)
    mocks.headers.mockResolvedValue(requestHeaders)

    await expect(getPageAuthState()).resolves.toEqual({ kind: 'authenticated', user })
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('falls back to Supabase only when no verified middleware context exists', async () => {
    mocks.getUser.mockResolvedValue({ data: { user }, error: null })

    await expect(getPageAuthState()).resolves.toEqual({ kind: 'authenticated', user })
    expect(mocks.createClient).toHaveBeenCalledTimes(1)
    expect(mocks.getUser).toHaveBeenCalledTimes(1)
  })

  it('preserves unauthenticated versus unavailable fallback states', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    await expect(getPageAuthState()).resolves.toEqual({ kind: 'unauthenticated' })

    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: Object.assign(new Error('Too many requests'), { status: 429 }),
    })
    await expect(getPageAuthState()).resolves.toEqual({ kind: 'unavailable' })
  })
})
