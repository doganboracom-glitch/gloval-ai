import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  provider: null as unknown,
  owned: null as string | null,
  mine: [] as Array<{ domain: string }>,
}))

vi.mock('./provider', () => ({ getDomainRegistrarProvider: () => m.provider }))
vi.mock('./ownership', () => ({ requireRegisteredByUs: async () => m.owned }))
vi.mock('../service', () => ({ listDomainsForUser: async () => m.mine }))

import { changeContact, changeLock, changeNameservers, changePrivacy, loadManagedDomain } from './manage-service'
import { RegistrarError } from './types'

const details = {
  domain: 'example.com',
  status: 'Active',
  locked: true,
  privacy: false,
  nameservers: ['ns1.a.com', 'ns2.a.com'],
  expiresAtRaw: '2027-01-01T00:00:00Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  startedAtRaw: null,
  remainingDays: 100,
  hasAuthCode: true,
}

function fakeProvider(over: Record<string, unknown> = {}) {
  return {
    getManagedDetails: vi.fn().mockResolvedValue(details),
    getContacts: vi.fn().mockResolvedValue({ registrant: null, admin: null, tech: null, billing: null }),
    setNameservers: vi.fn().mockResolvedValue({ changed: true }),
    setPrivacy: vi.fn().mockResolvedValue({ changed: true }),
    changeLock: vi.fn().mockResolvedValue({ changed: true }),
    updateContacts: vi.fn().mockResolvedValue({ changed: true }),
    ...over,
  }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.provider = fakeProvider()
  m.owned = 'example.com'
  m.mine = [{ domain: 'example.com' }]
})

describe('ownership and availability', () => {
  it('refuses when the registrar is not manage-capable and never touches ownership', async () => {
    m.provider = null
    expect(await loadManagedDomain('u1', 'example.com')).toEqual({ ok: false, error: 'REGISTRAR_UNAVAILABLE' })
  })

  it('NOT_FOUND for a domain the user does not hold', async () => {
    m.owned = null
    m.mine = []
    const p = m.provider as ReturnType<typeof fakeProvider>
    expect(await changeLock('u1', 'other.com', false)).toEqual({ ok: false, error: 'NOT_FOUND' })
    expect(p.changeLock).not.toHaveBeenCalled()
  })

  it('NOT_REGISTRAR_MANAGED for an externally connected domain, with no provider call', async () => {
    m.owned = null
    m.mine = [{ domain: 'external.com' }]
    const p = m.provider as ReturnType<typeof fakeProvider>
    expect(await changeNameservers('u1', 'external.com', ['ns1.x.com', 'ns2.x.com'])).toEqual({
      ok: false,
      error: 'NOT_REGISTRAR_MANAGED',
    })
    expect(p.setNameservers).not.toHaveBeenCalled()
  })
})

describe('loadManagedDomain', () => {
  it('returns details and contacts', async () => {
    const res = await loadManagedDomain('u1', 'example.com')
    expect(res).toMatchObject({ ok: true, contactsUnavailable: false })
    if (res.ok) expect(res.details.domain).toBe('example.com')
  })

  it('still renders when only the contacts read fails', async () => {
    m.provider = fakeProvider({ getContacts: vi.fn().mockRejectedValue(new RegistrarError('PROVIDER_ERROR')) })
    const res = await loadManagedDomain('u1', 'example.com')
    expect(res).toMatchObject({ ok: true, contacts: null, contactsUnavailable: true })
  })

  it('NOT_FOUND when the provider has no such domain', async () => {
    m.provider = fakeProvider({ getManagedDetails: vi.fn().mockResolvedValue(null) })
    expect(await loadManagedDomain('u1', 'example.com')).toEqual({ ok: false, error: 'NOT_FOUND' })
  })
})

describe('mutations', () => {
  it('passes through the change flag, including a no-op', async () => {
    m.provider = fakeProvider({ setPrivacy: vi.fn().mockResolvedValue({ changed: false }) })
    expect(await changePrivacy('u1', 'example.com', true)).toEqual({ ok: true, changed: false })
  })

  it('maps adapter errors to user-facing codes', async () => {
    const cases: Array<[RegistrarError, string]> = [
      [new RegistrarError('INVALID_INPUT'), 'INVALID_INPUT'],
      [new RegistrarError('OUTCOME_UNKNOWN'), 'OUTCOME_UNKNOWN'],
      [new RegistrarError('NOT_CONFIGURED'), 'REGISTRAR_UNAVAILABLE'],
      [new RegistrarError('PROVIDER_ERROR'), 'PROVIDER_REFUSED'],
    ]
    for (const [err, expected] of cases) {
      m.provider = fakeProvider({ setPrivacy: vi.fn().mockRejectedValue(err) })
      expect(await changePrivacy('u1', 'example.com', false)).toEqual({ ok: false, error: expected })
    }
  })

  it('an unknown exception is UNEXPECTED_ERROR, not NOT_FOUND', async () => {
    m.provider = fakeProvider({ setPrivacy: vi.fn().mockRejectedValue(new Error('boom')) })
    expect(await changePrivacy('u1', 'example.com', false)).toEqual({ ok: false, error: 'UNEXPECTED_ERROR' })
  })

  it('refuses nameserver and lock changes as FEATURE_UNSUPPORTED without calling the provider', async () => {
    const p = m.provider as ReturnType<typeof fakeProvider>
    expect(await changeNameservers('u1', 'example.com', ['ns1.x.com', 'ns2.x.com'])).toEqual({
      ok: false,
      error: 'FEATURE_UNSUPPORTED',
    })
    expect(await changeLock('u1', 'example.com', false)).toEqual({ ok: false, error: 'FEATURE_UNSUPPORTED' })
    expect(p.setNameservers).not.toHaveBeenCalled()
    expect(p.changeLock).not.toHaveBeenCalled()
  })

  it('rejects wrongly typed input without calling the provider', async () => {
    const p = m.provider as ReturnType<typeof fakeProvider>
    expect(await changeLock('u1', 'example.com', 'yes' as unknown as boolean)).toEqual({ ok: false, error: 'INVALID_INPUT' })
    expect(await changePrivacy('u1', 'example.com', 1 as unknown as boolean)).toEqual({ ok: false, error: 'INVALID_INPUT' })
    expect(await changeNameservers('u1', 'example.com', 'ns' as unknown as string[])).toEqual({
      ok: false,
      error: 'INVALID_INPUT',
    })
    expect(await changeContact('u1', 'example.com', null as never)).toEqual({ ok: false, error: 'INVALID_INPUT' })
    expect(p.changeLock).not.toHaveBeenCalled()
    expect(p.setPrivacy).not.toHaveBeenCalled()
  })

  it('does not log provider messages', async () => {
    const spy = vi.spyOn(console, 'error')
    m.provider = fakeProvider({
      setPrivacy: vi.fn().mockRejectedValue(new RegistrarError('PROVIDER_ERROR', 'secret-detail-123')),
    })
    await changePrivacy('u1', 'example.com', false)
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret-detail-123')
  })
})
