import { describe, expect, it } from 'vitest'
import { buildTrackingUrl, isValidTrackingNumber, normalizeTrackingNumber } from './shipping-carriers'

describe('tracking numbers and carrier links', () => {
  it.each(['ABC123', 'AB-123456', 'a'.repeat(40)])('accepts %s', (value) => expect(isValidTrackingNumber(value)).toBe(true))
  it.each(['short', 'a'.repeat(41), 'ABC_123', 'ABC 123', ''])('rejects %s', (value) => expect(isValidTrackingNumber(value)).toBe(false))
  it('trims valid input and rejects invalid input', () => {
    expect(normalizeTrackingNumber('  AB-123456  ')).toBe('AB-123456')
    expect(normalizeTrackingNumber('abc!123')).toBeNull()
  })
  it('only builds links from fixed carrier templates', () => {
    expect(buildTrackingUrl('ups', 'AB-123456')).toContain('https://www.ups.com/track?tracknum=AB-123456')
    expect(buildTrackingUrl('other', 'AB-123456')).toBeNull()
    expect(buildTrackingUrl('https://evil.example', 'AB-123456')).toBeNull()
  })
})
