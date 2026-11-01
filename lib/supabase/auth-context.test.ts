import { describe, expect, it } from 'vitest'
import {
  clearVerifiedUserHeaders,
  getAuthStateFromHeaders,
  getVerifiedUserFromHeaders,
  setUnauthenticatedAuthState,
  setUnavailableAuthState,
  setVerifiedUserHeaders,
  VERIFIED_USER_HEADERS,
} from './auth-context'

const user = {
  id: 'user-1',
  email: 'person+test@example.test',
  email_confirmed_at: '2025-01-01T00:00:00.000Z',
  created_at: '2025-01-01T00:00:00.000Z',
}

describe('verified user request headers', () => {
  it('round-trips the minimal verified identity summary', () => {
    const headers = new Headers()
    setVerifiedUserHeaders(headers, user)

    expect(getVerifiedUserFromHeaders(headers)).toEqual(user)
  })

  it('forwards only the allowed phone and signup draft metadata', () => {
    const headers = new Headers()
    setVerifiedUserHeaders(headers, {
      ...user,
      user_metadata: { phone: '0532 123 45 67', signup_draft_token: 'claim-1', private_field: 'hidden' } as never,
    })

    expect(getVerifiedUserFromHeaders(headers)?.user_metadata).toEqual({
      phone: '0532 123 45 67',
      signup_draft_token: 'claim-1',
    })
  })

  it('does not trust identity values without the verified marker', () => {
    const headers = new Headers({ [VERIFIED_USER_HEADERS.id]: user.id })

    expect(getVerifiedUserFromHeaders(headers)).toBeNull()
    expect(getAuthStateFromHeaders(headers)).toBeNull()
  })

  it('forwards signed-out and unavailable outcomes without an identity', () => {
    const signedOut = new Headers()
    setUnauthenticatedAuthState(signedOut)
    expect(getAuthStateFromHeaders(signedOut)).toEqual({ kind: 'unauthenticated' })

    const unavailable = new Headers()
    setUnavailableAuthState(unavailable)
    expect(getAuthStateFromHeaders(unavailable)).toEqual({ kind: 'unavailable' })
  })

  it('removes every internal identity header from an incoming request', () => {
    const headers = new Headers()
    setVerifiedUserHeaders(headers, user)

    clearVerifiedUserHeaders(headers)

    expect(getVerifiedUserFromHeaders(headers)).toBeNull()
    for (const value of Object.values(VERIFIED_USER_HEADERS)) {
      expect(headers.has(value)).toBe(false)
    }
  })
})
