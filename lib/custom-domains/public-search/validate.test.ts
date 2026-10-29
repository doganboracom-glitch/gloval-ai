import { describe, expect, it } from 'vitest'
import { parsePublicDomain, parsePublicSearchQuery } from './validate'

describe('parsePublicSearchQuery', () => {
  it('accepts a bare label and normalises URLs and case', () => {
    expect(parsePublicSearchQuery('Marka')).toEqual({ ok: true, label: 'marka', tld: null })
    expect(parsePublicSearchQuery('https://www.marka.com/yol?x=1')).toEqual({ ok: true, label: 'marka', tld: 'com' })
    expect(parsePublicSearchQuery('marka.com.tr')).toEqual({ ok: true, label: 'marka', tld: 'com.tr' })
  })

  it('rejects unsupported extensions distinctly from malformed input', () => {
    expect(parsePublicSearchQuery('marka.xyz')).toEqual({ ok: false, error: 'UNSUPPORTED_TLD' })
    expect(parsePublicSearchQuery('marka.com.evil')).toEqual({ ok: false, error: 'UNSUPPORTED_TLD' })
  })

  it.each([
    '',
    '   ',
    'a b',
    '-marka',
    'marka-',
    'xn--marka',
    'mağaza',
    'marka\u0000',
    'a'.repeat(64),
    'a'.repeat(101),
    '<script>',
    42,
    null,
    undefined,
  ])('rejects %j', (value) => {
    const result = parsePublicSearchQuery(value)
    expect(result.ok).toBe(false)
  })
})

describe('parsePublicDomain', () => {
  it('accepts only a clean label plus a supported extension', () => {
    expect(parsePublicDomain('marka.com')?.domain).toBe('marka.com')
    expect(parsePublicDomain('marka.com.tr')?.tld).toBe('com.tr')
  })

  it.each(['marka', 'MARKA.com', ' marka.com', 'marka.com/x', 'https://marka.com', 'marka.xyz', 'a.b.com', undefined])(
    'rejects %j',
    (value) => {
      expect(parsePublicDomain(value)).toBeNull()
    },
  )
})
