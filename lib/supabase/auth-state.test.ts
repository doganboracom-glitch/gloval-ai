import { describe, expect, it, vi } from 'vitest'
import { classifyAuthResult, getUserAuthState } from './auth-state'

const user = {
  id: 'user-1',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  aud: 'authenticated',
  email: 'user@example.test',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
}

function authError(message: string, status?: number, code?: string) {
  return Object.assign(new Error(message), { status, code })
}

describe('classifyAuthResult', () => {
  it('returns the user for a successful lookup', () => {
    expect(classifyAuthResult({ data: { user }, error: null })).toEqual({
      kind: 'authenticated',
      user,
    })
  })

  it('treats an empty successful response as no session', () => {
    expect(classifyAuthResult({ data: { user: null }, error: null })).toEqual({
      kind: 'unauthenticated',
    })
  })

  it.each([
    authError('JWT expired', 401),
    authError('Invalid token', 400, 'bad_jwt'),
    authError('No session found'),
  ])('treats definite session failures as unauthenticated', (error) => {
    expect(classifyAuthResult({ data: { user: null }, error })).toEqual({
      kind: 'unauthenticated',
    })
  })

  it.each([408, 425, 429, 500, 503])(
    'treats HTTP %s as temporarily unavailable',
    (status) => {
      expect(
        classifyAuthResult({
          data: { user: null },
          error: authError('Auth service unavailable', status),
        }),
      ).toEqual({ kind: 'unavailable' })
    },
  )

  it('defaults unknown errors to unavailable rather than signed out', () => {
    expect(
      classifyAuthResult({ data: { user: null }, error: new Error('upstream error') }),
    ).toEqual({ kind: 'unavailable' })
  })
})

describe('getUserAuthState', () => {
  it('converts rejected network requests to unavailable', async () => {
    const getUser = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

    await expect(getUserAuthState({ auth: { getUser } })).resolves.toEqual({
      kind: 'unavailable',
    })
  })
})
