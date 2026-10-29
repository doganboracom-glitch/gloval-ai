import { describe, expect, it } from 'vitest'
import { parseWhoisQuery } from './validate'

describe('parseWhoisQuery', () => {
  it.each([
    ['example.com', 'example.com'],
    ['  Example.COM. ', 'example.com'],
    ['www.example.com', 'example.com'],
    ['example.co.uk', 'example.co.uk'],
    ['sirket.com.tr', 'sirket.com.tr'],
    ['bücher.de', 'xn--bcher-kva.de'],
  ])('accepts %s', (input, domain) => {
    const parsed = parseWhoisQuery(input)
    expect(parsed.ok && parsed.domain).toBe(domain)
  })

  it.each([
    '',
    '   ',
    'localhost',
    'example',
    '127.0.0.1',
    '127.1',
    '0x7f.1',
    '2130706433',
    '[::1]',
    'http://example.com',
    'example.com/path',
    'example.com:8080',
    'user@example.com',
    'exa mple.com',
    'a..com',
    '.example.com',
    '-bad.com',
    'bad-.com',
    'foo.local',
    'foo.internal',
    'foo.onion',
    'a.b.c.example.com',
    'ab--cd.com',
    'x'.repeat(64) + '.com',
    'e'.repeat(300) + '.com',
  ])('rejects %j', (input) => {
    expect(parseWhoisQuery(input)).toEqual({ ok: false, error: 'INVALID_QUERY' })
  })

  it('rejects non-strings', () => {
    expect(parseWhoisQuery(null)).toEqual({ ok: false, error: 'INVALID_QUERY' })
    expect(parseWhoisQuery({ toString: () => 'example.com' })).toEqual({ ok: false, error: 'INVALID_QUERY' })
  })
})
