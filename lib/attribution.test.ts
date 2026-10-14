import { describe, expect, it } from 'vitest'
import { ATTRIBUTION_LIMITS, sanitizeAttribution } from './attribution'

const base = { params: {}, landing_path: '/', referrer_domain: null, captured_at: 1_700_000_000_000 }

describe('sanitizeAttribution field limits', () => {
  it('caps utm_* at 200 and click ids at 500 characters', () => {
    const result = sanitizeAttribution({
      ...base,
      params: {
        utm_source: 'a'.repeat(900),
        utm_campaign: 'b'.repeat(900),
        gclid: 'g'.repeat(900),
        fbclid: 'f'.repeat(900),
      },
    })
    expect(result?.params.utm_source).toHaveLength(ATTRIBUTION_LIMITS.utm)
    expect(result?.params.utm_campaign).toHaveLength(200)
    expect(result?.params.gclid).toHaveLength(ATTRIBUTION_LIMITS.clickId)
    expect(result?.params.fbclid).toHaveLength(500)
  })

  it('keeps a realistic click id intact (longer than the utm cap)', () => {
    const gclid = 'x'.repeat(320)
    expect(sanitizeAttribution({ ...base, params: { gclid } })?.params.gclid).toBe(gclid)
  })

  it('ignores unknown parameter keys', () => {
    const result = sanitizeAttribution({ ...base, params: { utm_source: 'google', email: 'a@b.c' } })
    expect(result?.params).toEqual({ utm_source: 'google' })
  })
})

describe('landing_path', () => {
  it('stores the pathname only, dropping query string and fragment', () => {
    expect(sanitizeAttribution({ ...base, landing_path: '/fiyatlar?utm_source=x&email=a@b.c#plans' })?.landing_path).toBe('/fiyatlar')
    expect(sanitizeAttribution({ ...base, landing_path: '/fiyatlar#plans' })?.landing_path).toBe('/fiyatlar')
    expect(sanitizeAttribution({ ...base, landing_path: '/?gclid=abc' })?.landing_path).toBe('/')
  })

  it('caps the path at 300 characters', () => {
    const result = sanitizeAttribution({ ...base, landing_path: `/${'p'.repeat(900)}` })
    expect(result?.landing_path).toHaveLength(ATTRIBUTION_LIMITS.landingPath)
  })

  it('rejects values that are not a path', () => {
    expect(sanitizeAttribution({ ...base, landing_path: 'https://evil.example/x' })?.landing_path).toBeNull()
    expect(sanitizeAttribution({ ...base, landing_path: '?only=query' })?.landing_path).toBeNull()
  })
})

describe('referrer_domain', () => {
  it('accepts a bare hostname and lowercases it', () => {
    expect(sanitizeAttribution({ ...base, referrer_domain: 'WWW.Google.com' })?.referrer_domain).toBe('www.google.com')
  })

  it('rejects URLs, paths, ports and other non-hostname input', () => {
    for (const value of ['https://google.com', 'google.com/search', 'google.com:443', 'a b.com', 'a..b', '.a.com']) {
      expect(sanitizeAttribution({ ...base, referrer_domain: value })?.referrer_domain).toBeNull()
    }
  })

  it('rejects hostnames over 255 characters', () => {
    expect(sanitizeAttribution({ ...base, referrer_domain: `${'a'.repeat(300)}.com` })?.referrer_domain).toBeNull()
  })
})

describe('captured_at', () => {
  it('rejects input without a valid capture time', () => {
    expect(sanitizeAttribution({ ...base, captured_at: 0 })).toBeNull()
    expect(sanitizeAttribution({ ...base, captured_at: 'nope' })).toBeNull()
    expect(sanitizeAttribution(null)).toBeNull()
  })
})
