import { describe, expect, it } from 'vitest'
import { resolveLoginNextPath } from './auth-redirect'
import { sanitizeNextPath, sanitizeNextPathWithDecoding } from './safe-redirect'

const HOSTILE = [
  '//evil.com',
  '///evil.com',
  'https://evil.com',
  'javascript:alert(1)',
  '/\\evil.com',
  '/\t/evil.com',
  '/\n/evil.com',
  '/\r/evil.com',
  '/ /evil.com',
  '/\u0000/evil.com',
  'evil.com',
]

describe('sanitizeNextPath', () => {
  it('keeps same-site paths, including the buy hand-off', () => {
    expect(sanitizeNextPath('/dashboard/domains?buy=marka.com')).toBe('/dashboard/domains?buy=marka.com')
  })

  it.each(HOSTILE)('falls back for %j', (value) => {
    expect(sanitizeNextPath(value, '/safe')).toBe('/safe')
  })

  it('never resolves off-origin for any hostile value', () => {
    for (const value of HOSTILE) {
      const out = sanitizeNextPath(value, '/safe')
      expect(new URL(out, 'https://gloval.ai').origin).toBe('https://gloval.ai')
    }
  })
})

const LEGIT = [
  '/dashboard',
  '/billing',
  '/editor/3f2b1c9e-8a44-4d0e-9b1a-1c2d3e4f5a6b',
  '/ecommerce/3f2b1c9e-8a44-4d0e-9b1a-1c2d3e4f5a6b/orders',
  '/dashboard/domains?buy=marka.com',
  '/billing?plan=pro&cycle=yearly',
  '/auth/resume?draft=abc_DEF-123',
  '/editor/abc#design',
]

describe('legitimate internal paths keep working', () => {
  it.each(LEGIT)('sanitizeNextPath keeps %s', (path) => {
    expect(sanitizeNextPath(path, '/safe')).toBe(path)
  })

  it.each(LEGIT)('sanitizeNextPathWithDecoding keeps %s (plain and encoded once)', (path) => {
    expect(sanitizeNextPathWithDecoding(path, '/safe')).toBe(path)
    expect(sanitizeNextPathWithDecoding(encodeURIComponent(path), '/safe')).toBe(path)
  })

  it('the query-string form "?next=/dashboard" round-trips through the login resolver', () => {
    for (const path of ['/dashboard', '/billing', '/editor/abc-123']) {
      const next = new URL(`https://gloval.ai/auth/login?next=${encodeURIComponent(path)}`).searchParams.get('next')
      expect(resolveLoginNextPath(null, next)).toBe(path)
    }
  })

  it('missing next falls back to /dashboard', () => {
    expect(sanitizeNextPath(null)).toBe('/dashboard')
    expect(sanitizeNextPath('')).toBe('/dashboard')
    expect(resolveLoginNextPath(null, null)).toBe('/dashboard')
  })

  it('hostile values fall back to /dashboard by default', () => {
    for (const value of HOSTILE) expect(sanitizeNextPath(value)).toBe('/dashboard')
  })
})

describe('sanitizeNextPathWithDecoding', () => {
  it('decodes nested encoding but still rejects hostile results', () => {
    expect(sanitizeNextPathWithDecoding('%2Fdashboard%2Fdomains', '/safe')).toBe('/dashboard/domains')
    expect(sanitizeNextPathWithDecoding('%252F%252Fevil.com', '/safe')).toBe('/safe')
    expect(sanitizeNextPathWithDecoding('%2F%09%2Fevil.com', '/safe')).toBe('/safe')
    expect(sanitizeNextPathWithDecoding('%2F%5Cevil.com', '/safe')).toBe('/safe')
  })
})
