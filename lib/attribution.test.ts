// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_LIMITS,
  readAttribution,
  sanitizeAttribution,
  shouldReplaceAttribution,
  snapshotFromLocation,
} from './attribution'

const base = { params: {}, landing_path: '/', captured_at: 1_700_000_000_000 }

describe('sanitizeAttribution field limits', () => {
  it('caps UTM values at 200 characters and converts click IDs to booleans', () => {
    const result = sanitizeAttribution({
      ...base,
      params: {
        utm_source: 'a'.repeat(900),
        utm_campaign: 'b'.repeat(900),
        gclid: 'not-retained',
        fbclid: '',
      },
    })
    expect(result?.params.utm_source).toHaveLength(ATTRIBUTION_LIMITS.utm)
    expect(result?.params.utm_campaign).toHaveLength(200)
    expect(result?.params.gclid).toBe(true)
    expect(result?.params.fbclid).toBe(false)
    expect(JSON.stringify(result)).not.toContain('not-retained')
  })

  it('keeps boolean click presence without retaining click IDs', () => {
    expect(sanitizeAttribution({ ...base, params: { gclid: true, fbclid: false } })?.params).toEqual({
      gclid: true,
      fbclid: false,
    })
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

describe('first-touch cookie behavior', () => {
  afterEach(() => {
    document.cookie = `${ATTRIBUTION_COOKIE}=; max-age=0; path=/`
    window.history.replaceState({}, '', '/')
  })

  it('keeps the first campaign touch and normalizes legacy click IDs on read', () => {
    const first = {
      ...base,
      captured_at: Date.now(),
      params: { utm_source: 'meta', utm_campaign: 'spring', gclid: 'legacy-click-value' },
    }
    document.cookie = `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(first))}; path=/; max-age=1800; samesite=lax`
    window.history.replaceState({}, '', '/second?utm_source=google&gclid=another-value')
    expect(snapshotFromLocation()?.params.utm_source).toBe('google')
    expect(shouldReplaceAttribution(readAttribution())).toBe(false)
    expect(readAttribution()?.params).toEqual({ utm_source: 'meta', utm_campaign: 'spring', gclid: true })
    expect(document.cookie).not.toContain('legacy-click-value')
    expect(document.cookie).not.toContain('another-value')
  })

  it('captures click-ID presence as booleans and excludes query strings from landing paths', () => {
    window.history.replaceState({}, '', '/paketler?utm_source=google&gclid=secret&fbclid=')
    expect(snapshotFromLocation()).toMatchObject({
      params: { utm_source: 'google', gclid: true, fbclid: true },
      landing_path: '/paketler',
    })
  })
})

describe('captured_at', () => {
  it('rejects input without a valid capture time', () => {
    expect(sanitizeAttribution({ ...base, captured_at: 0 })).toBeNull()
    expect(sanitizeAttribution({ ...base, captured_at: 'nope' })).toBeNull()
    expect(sanitizeAttribution(null)).toBeNull()
  })
})
