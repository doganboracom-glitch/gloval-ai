import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setVerifiedUserHeaders } from './auth-context'
import { getPageAuthState } from './page-auth'

const mocks = vi.hoisted(() => ({ headers: vi.fn() }))

vi.mock('next/headers', () => ({ headers: mocks.headers }))

const user = {
  id: 'user-1',
  email: 'person@example.test',
  email_confirmed_at: '2025-01-01T00:00:00.000Z',
  created_at: '2025-01-01T00:00:00.000Z',
}

function clientWith(result: unknown) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue(result),
    },
  }
}

beforeEach(() => {
  mocks.headers.mockReset()
})

describe('getPageAuthState', () => {
  it('prefers a successful Auth lookup', async () => {
    const client = clientWith({ data: { user }, error: null })

    await expect(getPageAuthState(client as never)).resolves.toEqual({
      kind: 'authenticated',
      user,
    })
    expect(mocks.headers).not.toHaveBeenCalled()
  })

  it('uses only middleware-verified context when a second lookup is unavailable', async () => {
    const requestHeaders = new Headers()
    setVerifiedUserHeaders(requestHeaders, user)
    mocks.headers.mockResolvedValue(requestHeaders)

    await expect(
      getPageAuthState(
        clientWith({
          data: { user: null },
          error: Object.assign(new Error('Too many requests'), { status: 429 }),
        }) as never,
      ),
    ).resolves.toEqual({ kind: 'authenticated', user })
  })

  it('keeps an unavailable state when there is no verified middleware context', async () => {
    mocks.headers.mockResolvedValue(new Headers())

    await expect(
      getPageAuthState(
        clientWith({
          data: { user: null },
          error: Object.assign(new Error('Too many requests'), { status: 429 }),
        }) as never,
      ),
    ).resolves.toEqual({ kind: 'unavailable' })
  })
})
