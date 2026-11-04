import { describe, expect, it } from 'vitest'
import { isActiveAndUnexpired } from './nameserver-access'

const NOW = Date.parse('2026-11-04T12:00:00.000Z')

describe('isActiveAndUnexpired', () => {
  it('allows only active registrations whose expiry is in the future', () => {
    expect(
      isActiveAndUnexpired(
        { status: 'Active', expiresAt: '2026-11-05T00:00:00.000Z', remainingDays: 1 },
        NOW,
      ),
    ).toBe(true)
    expect(
      isActiveAndUnexpired(
        { status: 'Expired', expiresAt: '2026-11-05T00:00:00.000Z', remainingDays: 1 },
        NOW,
      ),
    ).toBe(false)
    expect(
      isActiveAndUnexpired(
        { status: 'Active', expiresAt: '2026-11-04T12:00:00.000Z', remainingDays: 1 },
        NOW,
      ),
    ).toBe(false)
  })

  it('uses a positive provider remaining-day count only when no valid expiry instant exists', () => {
    expect(isActiveAndUnexpired({ status: 'Active', expiresAt: null, remainingDays: 2 }, NOW)).toBe(true)
    expect(isActiveAndUnexpired({ status: 'Active', expiresAt: 'unknown', remainingDays: 0 }, NOW)).toBe(false)
    expect(isActiveAndUnexpired({ status: 'Active', expiresAt: null, remainingDays: null }, NOW)).toBe(false)
  })
})
