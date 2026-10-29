import { describe, expect, it } from 'vitest'
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

describe('sanitizeNextPathWithDecoding', () => {
  it('decodes nested encoding but still rejects hostile results', () => {
    expect(sanitizeNextPathWithDecoding('%2Fdashboard%2Fdomains', '/safe')).toBe('/dashboard/domains')
    expect(sanitizeNextPathWithDecoding('%252F%252Fevil.com', '/safe')).toBe('/safe')
    expect(sanitizeNextPathWithDecoding('%2F%09%2Fevil.com', '/safe')).toBe('/safe')
    expect(sanitizeNextPathWithDecoding('%2F%5Cevil.com', '/safe')).toBe('/safe')
  })
})
