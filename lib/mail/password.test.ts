import { describe, expect, it } from 'vitest'
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  checkPasswordRules,
  generateStrongPassword,
  validateMailboxPassword,
} from './password'

describe('validateMailboxPassword', () => {
  it('accepts a matching password with a letter, a digit and enough length', () => {
    expect(validateMailboxPassword('abcdefgh12', 'abcdefgh12')).toEqual([])
  })

  it('reports every broken rule', () => {
    expect(validateMailboxPassword('abc', 'abd')).toEqual(['too_short', 'no_digit', 'mismatch'])
    expect(validateMailboxPassword('1234567890', '1234567890')).toEqual(['no_letter'])
  })

  it('rejects over-long passwords', () => {
    const long = 'a1'.repeat(PASSWORD_MAX_LENGTH)
    expect(validateMailboxPassword(long, long)).toContain('too_long')
  })

  it('treats non-string input as invalid instead of throwing', () => {
    expect(validateMailboxPassword(undefined, undefined)).not.toEqual([])
    expect(validateMailboxPassword(123, 123)).not.toEqual([])
  })

  it('accepts non-ASCII letters', () => {
    expect(validateMailboxPassword('şifre12345', 'şifre12345')).toEqual([])
  })
})

describe('checkPasswordRules', () => {
  it('does not report an empty pair as matching', () => {
    expect(checkPasswordRules('', '').matches).toBe(false)
  })
})

describe('generateStrongPassword', () => {
  it('always produces a password that passes validation', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateStrongPassword()
      expect(validateMailboxPassword(pw, pw)).toEqual([])
    }
  })

  it('never goes below the minimum length', () => {
    expect(generateStrongPassword(3).length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH)
  })
})
