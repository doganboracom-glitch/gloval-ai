import { describe, expect, it } from 'vitest'
import { parseProviderDate, readRawField } from './provider-date'

describe('parseProviderDate', () => {
  it('keeps a zone-less value raw and never invents an instant', () => {
    expect(parseProviderDate('2027-10-04T17:55:29.4171901')).toEqual({
      raw: '2027-10-04T17:55:29.4171901',
      instant: null,
      zone: 'unknown',
    })
  })

  it('converts an explicit Z value to UTC, trimming 7-digit fractions', () => {
    expect(parseProviderDate('2027-10-04T14:55:29.4171901Z')).toEqual({
      raw: '2027-10-04T14:55:29.4171901Z',
      instant: '2027-10-04T14:55:29.417Z',
      zone: 'explicit',
    })
  })

  it('converts an explicit offset to the matching UTC instant', () => {
    expect(parseProviderDate('2027-10-04T17:55:29+03:00').instant).toBe('2027-10-04T14:55:29.000Z')
    expect(parseProviderDate('2027-10-04T17:55:29+0300').instant).toBe('2027-10-04T14:55:29.000Z')
  })

  it('treats the 0001-01-01 placeholder, blanks and non-strings as absent', () => {
    for (const v of ['0001-01-01T00:00:00', '', '   ', null, undefined, 42, {}]) {
      expect(parseProviderDate(v)).toEqual({ raw: null, instant: null, zone: 'none' })
    }
  })

  it('does not treat a date-only or garbage value as an instant', () => {
    expect(parseProviderDate('2027-10-04').zone).toBe('unknown')
    expect(parseProviderDate('not-a-date').instant).toBeNull()
  })

  it('does not mistake the date separator dashes for an offset', () => {
    expect(parseProviderDate('2027-10-04T17:55:29').instant).toBeNull()
  })

  it('gives the same answer regardless of the process time zone', () => {
    const previous = process.env.TZ
    try {
      const results = ['UTC', 'Europe/Istanbul', 'America/New_York'].map((tz) => {
        process.env.TZ = tz
        return JSON.stringify([
          parseProviderDate('2027-10-04T17:55:29.4171901'),
          parseProviderDate('2027-10-04T14:55:29Z'),
        ])
      })
      expect(new Set(results).size).toBe(1)
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  })
})

describe('readRawField', () => {
  it('returns string fields and ignores everything else', () => {
    expect(readRawField({ expirationDate: '2027-10-04T17:55:29' }, 'expirationDate')).toBe('2027-10-04T17:55:29')
    expect(readRawField({ expirationDate: 5 }, 'expirationDate')).toBeUndefined()
    expect(readRawField(null, 'expirationDate')).toBeUndefined()
    expect(readRawField('x', 'expirationDate')).toBeUndefined()
  })
})
