import { describe, expect, it } from 'vitest'
import { normalizeStatus, sanitizeRdapDomain } from './sanitize'

const raw = {
  objectClassName: 'domain',
  ldhName: 'EXAMPLE.com.',
  status: ['client transfer prohibited', 'clientUpdateProhibited', 'bogus', 'ok'],
  nameservers: [{ ldhName: 'B.NS.example.net.' }, { ldhName: 'a.ns.example.net' }, { ldhName: 'bad host' }],
  secureDNS: { delegationSigned: true },
  events: [
    { eventAction: 'registration', eventDate: '2010-05-01T10:00:00Z' },
    { eventAction: 'expiration', eventDate: '2030-05-01T10:00:00Z' },
    { eventAction: 'last changed', eventDate: 'not a date' },
  ],
  entities: [
    {
      roles: ['registrant'],
      vcardArray: ['vcard', [['fn', {}, 'text', 'Jane Private'], ['email', {}, 'text', 'jane@example.com']]],
    },
    {
      roles: ['registrar'],
      vcardArray: ['vcard', [['fn', {}, 'text', 'Acme   Registrar,\u200b Inc.']]],
    },
  ],
}

describe('sanitizeRdapDomain', () => {
  it('projects only the allowlisted fields', () => {
    const result = sanitizeRdapDomain(raw, 'example.com')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.record).toEqual({
      domain: 'example.com',
      registrar: 'Acme Registrar, Inc.',
      registeredAt: '2010-05-01T10:00:00.000Z',
      updatedAt: null,
      expiresAt: '2030-05-01T10:00:00.000Z',
      statuses: ['clientTransferProhibited', 'clientUpdateProhibited', 'ok'],
      nameservers: ['a.ns.example.net', 'b.ns.example.net'],
      dnssec: 'signed',
    })
  })

  it('never leaks registrant contact data', () => {
    const result = sanitizeRdapDomain(raw, 'example.com')
    expect(JSON.stringify(result)).not.toMatch(/Jane|jane@/)
  })

  it('drops registrar names that look personal', () => {
    const withEmail = {
      ...raw,
      entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'a@b.com']]] }],
    }
    const result = sanitizeRdapDomain(withEmail, 'example.com')
    expect(result.ok && result.record.registrar).toBeNull()
  })

  it('rejects a response about another domain or a non-domain object', () => {
    expect(sanitizeRdapDomain(raw, 'other.com')).toEqual({ ok: false })
    expect(sanitizeRdapDomain({ objectClassName: 'nameserver' }, 'example.com')).toEqual({ ok: false })
    expect(sanitizeRdapDomain('x', 'example.com')).toEqual({ ok: false })
  })

  it('reports unknown DNSSEC when absent', () => {
    const result = sanitizeRdapDomain({ objectClassName: 'domain' }, 'example.com')
    expect(result.ok && result.record.dnssec).toBe('unknown')
  })
})

describe('normalizeStatus', () => {
  it('maps spaced and camelCase forms and rejects unknown values', () => {
    expect(normalizeStatus('pending delete')).toBe('pendingDelete')
    expect(normalizeStatus('serverHold')).toBe('serverHold')
    expect(normalizeStatus('<script>')).toBeNull()
    expect(normalizeStatus(5)).toBeNull()
  })
})
