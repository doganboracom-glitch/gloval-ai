import { describe, expect, it } from 'vitest'
import {
  MAX_ALIAS_DESTINATIONS,
  isExternalDestination,
  normalizeDestinationAddress,
  validateAliasDestinations,
} from './alias-destinations'

const internal = new Set(['info@example.com', 'sales@example.com'])

function run(destinations: unknown, internalAddresses: ReadonlySet<string> | null = internal) {
  return validateAliasDestinations({
    aliasAddress: 'hello@example.com',
    domain: 'example.com',
    destinations,
    internalAddresses,
  })
}

describe('normalizeDestinationAddress', () => {
  it('lower-cases and trims a single address', () => {
    expect(normalizeDestinationAddress('  Person@Gmail.com ')).toBe('person@gmail.com')
  })

  it.each([
    'a@b.com,c@d.com',
    'a@b.com; c@d.com',
    'a@b.com c@d.com',
    'a@b.com\nc@d.com',
    'no-at-sign',
    'a@b',
    'a..b@c.com',
    '',
    42,
    null,
  ])('rejects %j', (value) => {
    expect(normalizeDestinationAddress(value)).toBeNull()
  })
})

describe('isExternalDestination', () => {
  it('compares against the alias domain, case-insensitively', () => {
    expect(isExternalDestination('a@Example.com', 'example.com')).toBe(false)
    expect(isExternalDestination('a@gmail.com', 'example.com')).toBe(true)
  })
})

describe('validateAliasDestinations', () => {
  it('accepts a mix of internal and external destinations', () => {
    expect(run(['info@example.com', 'me@gmail.com'])).toEqual({
      ok: true,
      destinations: ['info@example.com', 'me@gmail.com'],
    })
  })

  it('de-duplicates case-insensitively', () => {
    expect(run(['ME@gmail.com', 'me@gmail.com'])).toEqual({ ok: true, destinations: ['me@gmail.com'] })
  })

  it('rejects an unknown address on the alias domain', () => {
    expect(run(['ghost@example.com'])).toEqual({ ok: false, code: 'INVALID_DESTINATION' })
  })

  it('skips the ownership check when internalAddresses is null', () => {
    expect(run(['ghost@example.com'], null).ok).toBe(true)
  })

  it('rejects forwarding to itself', () => {
    expect(run(['hello@example.com'])).toEqual({ ok: false, code: 'SELF_DESTINATION' })
  })

  it('rejects comma-smuggled extra destinations', () => {
    expect(run(['me@gmail.com,victim@evil.com'])).toEqual({ ok: false, code: 'INVALID_DESTINATION' })
  })

  it('rejects empty and non-array input', () => {
    expect(run([])).toEqual({ ok: false, code: 'INVALID_DESTINATION' })
    expect(run('me@gmail.com')).toEqual({ ok: false, code: 'INVALID_DESTINATION' })
  })

  it('enforces the destination cap', () => {
    const many = Array.from({ length: MAX_ALIAS_DESTINATIONS + 1 }, (_, i) => `user${i}@gmail.com`)
    expect(run(many)).toEqual({ ok: false, code: 'TOO_MANY_DESTINATIONS' })
    expect(run(many.slice(0, MAX_ALIAS_DESTINATIONS)).ok).toBe(true)
  })
})
