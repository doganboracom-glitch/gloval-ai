import { describe, expect, it } from 'vitest'
import { MAX_SITE_ADDRESS_LENGTH, normalizeSiteAddress } from '@/lib/ads/normalize-site-address'

describe('normalizeSiteAddress', () => {
  it.each([
    ['ornek.com', 'ornek.com'],
    ['  Ornek.COM  ', 'ornek.com'],
    ['https://www.ornek.com/hakkimizda?x=1#a', 'www.ornek.com'],
    ['http://ornek.com.tr:80/', 'ornek.com.tr'],
    ['ornek.com.', 'ornek.com'],
    ['https://münchen.de', 'xn--mnchen-3ya.de'],
  ])('accepts %j as %s', (input, host) => {
    expect(normalizeSiteAddress(input)).toEqual({ ok: true, host, url: `https://${host}` })
  })

  it('keeps only the origin and never echoes path, query or credentials', () => {
    const result = normalizeSiteAddress('https://ornek.com/gizli/yol?token=abc')
    expect(result).toEqual({ ok: true, host: 'ornek.com', url: 'https://ornek.com' })
  })

  it.each([
    'localhost',
    'http://localhost:3000',
    '127.0.0.1',
    '10.0.0.5',
    '192.168.1.1',
    '169.254.169.254',
    '0x7f.1',
    '2130706433',
    '[::1]',
    'http://[fd00::1]/',
    'https://user:pass@ornek.com',
    'ornek.com:8080',
    'ftp://ornek.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'intranet',
    'printer.local',
    'api.internal',
    'foo.localhost',
    'ornek com',
    'ornek..com',
    '-ornek.com',
    'ornek.c0m',
  ])('rejects %j', (input) => {
    const result = normalizeSiteAddress(input)
    expect(result.ok).toBe(false)
  })

  it('reports empty and oversized input distinctly', () => {
    expect(normalizeSiteAddress('   ')).toEqual({ ok: false, reason: 'empty' })
    expect(normalizeSiteAddress('a'.repeat(MAX_SITE_ADDRESS_LENGTH + 1) + '.com')).toEqual({
      ok: false,
      reason: 'too_long',
    })
  })
})
