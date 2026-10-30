import { describe, expect, it } from 'vitest'
import { handoverHref, handoverLinkState } from './domain-handover-link'

const base = { provider: 'domainnameapi', orderId: 'ord-1', status: 'active', heldAt: null } as const

describe('handoverHref', () => {
  it('puts the domain in the query string', () => {
    expect(handoverHref('ornek.com')).toBe('/admin/domains/handover?domain=ornek.com')
  })

  it('encodes characters that would break the query', () => {
    expect(handoverHref('a&b=c d.com')).toBe('/admin/domains/handover?domain=a%26b%3Dc%20d.com')
  })
})

describe('handoverLinkState', () => {
  it('is eligible for an active registrar domain with an order', () => {
    expect(handoverLinkState({ ...base })).toEqual({ kind: 'eligible' })
  })

  it('is held whenever a quarantine timestamp is set, before any other rule', () => {
    expect(handoverLinkState({ ...base, heldAt: '2026-10-30T10:00:00Z' })).toEqual({ kind: 'held' })
    expect(
      handoverLinkState({ provider: null, orderId: null, status: 'pending', heldAt: '2026-10-30T10:00:00Z' }),
    ).toEqual({ kind: 'held' })
  })

  it('blocks non-registrar providers', () => {
    expect(handoverLinkState({ ...base, provider: 'manual' })).toEqual({ kind: 'blocked', reason: 'not_registrar' })
    expect(handoverLinkState({ ...base, provider: null })).toEqual({ kind: 'blocked', reason: 'not_registrar' })
  })

  it('blocks registrar domains without an order (transfer-in)', () => {
    expect(handoverLinkState({ ...base, orderId: null })).toEqual({ kind: 'blocked', reason: 'no_order' })
  })

  it('blocks domains that are not active', () => {
    expect(handoverLinkState({ ...base, status: 'verifying' })).toEqual({ kind: 'blocked', reason: 'not_active' })
  })
})
