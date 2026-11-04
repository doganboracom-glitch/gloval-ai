import { describe, expect, it } from 'vitest'
import { normalizeNameserver, normalizeNameservers } from './nameserver-validation'

describe('normalizeNameserver', () => {
  it('normalizes case and a terminal DNS root dot', () => {
    expect(normalizeNameserver('NS1.Example.COM.')).toBe('ns1.example.com')
  })

  it.each([
    '',
    'ns1.example.com ',
    'ns one.example.com',
    'https://ns.example.com',
    '192.0.2.53',
    '2001:db8::53',
    '-ns.example.com',
    'ns-.example.com',
    'ns..example.com',
    `${'a'.repeat(64)}.example.com`,
  ])('rejects invalid FQDN %j', (value) => {
    expect(normalizeNameserver(value)).toBeNull()
  })
})

describe('normalizeNameservers', () => {
  it('requires between 2 and 13 nameservers', () => {
    expect(normalizeNameservers([])).toEqual({ ok: false, reason: 'count' })
    expect(normalizeNameservers(['ns1.example.com'])).toEqual({ ok: false, reason: 'count' })
    expect(
      normalizeNameservers(Array.from({ length: 14 }, (_, index) => `ns${index + 1}.example.com`)),
    ).toEqual({ ok: false, reason: 'count' })
  })

  it('normalizes all entries and rejects duplicates after normalization', () => {
    expect(normalizeNameservers(['NS1.Example.COM.', 'Ns2.Example.com'])).toEqual({
      ok: true,
      nameservers: ['ns1.example.com', 'ns2.example.com'],
    })
    expect(normalizeNameservers(['NS1.Example.COM.', 'ns1.example.com'])).toEqual({
      ok: false,
      reason: 'duplicate',
    })
  })

  it('rejects the whole list when any entry is invalid', () => {
    expect(normalizeNameservers(['ns1.example.com', '10.0.0.1'])).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })
})
