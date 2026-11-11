import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createOptOutToken, verifyOptOutToken } from './token'

const USER = '3f2b8c1e-9d4a-4e6b-8a1c-2b7d5e9f0a11'

describe('opt-out token', () => {
  beforeEach(() => {
    vi.stubEnv('DRAFT_REMINDERS_TOKEN_SECRET', 'unit-test-secret-0123456789')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('round-trips a user id', () => {
    const token = createOptOutToken(USER)
    expect(token).toBeTruthy()
    expect(verifyOptOutToken(token as string)).toBe(USER)
  })

  it('rejects tampered signatures, swapped user ids and garbage', () => {
    const token = createOptOutToken(USER) as string
    const [, signature] = token.split('.')
    expect(verifyOptOutToken(`${USER}.${signature.slice(0, -1)}A`)).toBeNull()
    expect(verifyOptOutToken(`00000000-0000-4000-8000-000000000000.${signature}`)).toBeNull()
    expect(verifyOptOutToken('not-a-token')).toBeNull()
    expect(verifyOptOutToken('')).toBeNull()
    expect(verifyOptOutToken(`${token}.extra`)).toBeNull()
  })

  it('fails closed without a secret or with an invalid user id', () => {
    expect(createOptOutToken('not-a-uuid')).toBeNull()
    const token = createOptOutToken(USER) as string
    vi.stubEnv('DRAFT_REMINDERS_TOKEN_SECRET', '')
    vi.stubEnv('STORE_ORDER_TOKEN_SECRET', '')
    expect(createOptOutToken(USER)).toBeNull()
    expect(verifyOptOutToken(token)).toBeNull()
  })
})
