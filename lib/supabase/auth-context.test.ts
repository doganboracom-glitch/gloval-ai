import { describe, expect, it } from 'vitest'
import {
  clearVerifiedUserHeaders,
  getVerifiedUserFromHeaders,
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

  it('does not trust identity values without the verified marker', () => {
    const headers = new Headers({ [VERIFIED_USER_HEADERS.id]: user.id })

    expect(getVerifiedUserFromHeaders(headers)).toBeNull()
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
