import { describe, expect, it } from 'vitest'
import { formatIban, isValidTurkishIban, normalizeIban } from './iban'

const VALID = 'TR330006100519786457841326'

describe('iban', () => {
  it('accepts a valid Turkish IBAN with spaces and lowercase', () => {
    expect(isValidTurkishIban(VALID)).toBe(true)
    expect(isValidTurkishIban('tr33 0006 1005 1978 6457 8413 26')).toBe(true)
  })

  it('rejects wrong checksum, length and country', () => {
    expect(isValidTurkishIban('TR330006100519786457841327')).toBe(false)
    expect(isValidTurkishIban('TR33000610051978645784132')).toBe(false)
    expect(isValidTurkishIban('DE89370400440532013000')).toBe(false)
    expect(isValidTurkishIban('')).toBe(false)
  })

  it('normalizes and formats', () => {
    expect(normalizeIban('tr33 0006-1005')).toBe('TR3300061005')
    expect(formatIban(VALID)).toBe('TR33 0006 1005 1978 6457 8413 26')
  })
})
