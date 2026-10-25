import { describe, expect, it } from 'vitest'
import {
  FREE_CHOSEN_MAX_AGE_MS,
  signFreeChosenIntent,
  verifyFreeChosenIntent,
} from '@/lib/free-chosen-intent'

const SECRET = 'test-secret'
const NOW = 1_700_000_000_000

describe('free chosen intent', () => {
  const token = signFreeChosenIntent(SECRET, 'p1', 'u1', NOW)

  it('accepts a fresh token for the same project and user', () => {
    expect(verifyFreeChosenIntent(SECRET, 'p1', 'u1', token, NOW + 1000)).toBe(true)
  })

  it('rejects another project, another user, a wrong secret and a missing secret', () => {
    expect(verifyFreeChosenIntent(SECRET, 'p2', 'u1', token, NOW)).toBe(false)
    expect(verifyFreeChosenIntent(SECRET, 'p1', 'u2', token, NOW)).toBe(false)
    expect(verifyFreeChosenIntent('other', 'p1', 'u1', token, NOW)).toBe(false)
    expect(verifyFreeChosenIntent(null, 'p1', 'u1', token, NOW)).toBe(false)
  })

  it('rejects an expired token', () => {
    expect(verifyFreeChosenIntent(SECRET, 'p1', 'u1', token, NOW + FREE_CHOSEN_MAX_AGE_MS + 1)).toBe(false)
  })

  it('rejects malformed or tampered tokens', () => {
    expect(verifyFreeChosenIntent(SECRET, 'p1', 'u1', undefined, NOW)).toBe(false)
    expect(verifyFreeChosenIntent(SECRET, 'p1', 'u1', 'abc', NOW)).toBe(false)
    const [, sig] = token.split('.')
    expect(verifyFreeChosenIntent(SECRET, 'p1', 'u1', `${NOW + 9_999_999}.${sig}`, NOW)).toBe(false)
  })
})
