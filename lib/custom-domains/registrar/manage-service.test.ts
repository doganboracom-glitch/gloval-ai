import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  provider: null as unknown,
  owned: null as string | null,
  mine: [] as Array<{ domain: string }>,
  rpcCalls: [] as unknown[][],
  rateLimitResult: { data: { allowed: true } as { allowed: boolean } | null, error: null as { code?: string } | null },
}))

vi.mock('./provider', () => ({ getDomainRegistrarProvider: () => m.provider }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (...args: unknown[]) => {
      m.rpcCalls.push(args)
      return { maybeSingle: async () => m.rateLimitResult }
    },
  }),
}))
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
  m.rpcCalls = []
  m.rateLimitResult = { data: { allowed: true }, error: null }
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

  it('normalizes nameservers, reserves five changes per hour, and then applies the change', async () => {
    const p = m.provider as ReturnType<typeof fakeProvider>
    expect(await changeNameservers('u1', 'example.com', ['NS1.New.COM.', 'ns2.new.com'])).toEqual({
      ok: true,
      changed: true,
    })
    expect(m.rpcCalls).toEqual([
      ['reserve_rate_limit', { p_subject: 'domain:nameservers:u1', p_limit: 5, p_window_seconds: 3600 }],
    ])
    expect(p.setNameservers).toHaveBeenCalledWith('example.com', ['ns1.new.com', 'ns2.new.com'])
  })

  it('does not consume a rate-limit reservation for a no-op', async () => {
    const p = m.provider as ReturnType<typeof fakeProvider>
    expect(await changeNameservers('u1', 'example.com', ['NS2.A.COM.', 'ns1.a.com'])).toEqual({
      ok: true,
      changed: false,
    })
    expect(m.rpcCalls).toHaveLength(0)
    expect(p.setNameservers).not.toHaveBeenCalled()
  })

  it('rejects expired domains before reserving or calling the provider', async () => {
    m.provider = fakeProvider({
      getManagedDetails: vi.fn().mockResolvedValue({
        ...details,
        expiresAt: '2020-01-01T00:00:00.000Z',
        remainingDays: 0,
      }),
    })
    const p = m.provider as ReturnType<typeof fakeProvider>
    expect(await changeNameservers('u1', 'example.com', ['ns1.new.com', 'ns2.new.com'])).toEqual({
      ok: false,
      error: 'PROVIDER_REFUSED',
    })
    expect(m.rpcCalls).toHaveLength(0)
    expect(p.setNameservers).not.toHaveBeenCalled()
  })

  it('fails closed when the hourly limit is exhausted or the limiter is unavailable', async () => {
    const p = m.provider as ReturnType<typeof fakeProvider>
    m.rateLimitResult = { data: { allowed: false }, error: null }
    expect(await changeNameservers('u1', 'example.com', ['ns1.new.com', 'ns2.new.com'])).toEqual({
      ok: false,
      error: 'RATE_LIMITED',
    })
    expect(p.setNameservers).not.toHaveBeenCalled()

    m.rateLimitResult = { data: null, error: { code: 'RPC_ERROR' } }
    expect(await changeNameservers('u1', 'example.com', ['ns1.new.com', 'ns2.new.com'])).toEqual({
      ok: false,
      error: 'UNEXPECTED_ERROR',
    })
    expect(p.setNameservers).not.toHaveBeenCalled()
  })

  it('keeps the lock change unsupported and never logs nameserver values', async () => {
    const p = m.provider as ReturnType<typeof fakeProvider>
    expect(await changeLock('u1', 'example.com', false)).toEqual({ ok: false, error: 'FEATURE_UNSUPPORTED' })
    m.provider = fakeProvider({
      setNameservers: vi.fn().mockRejectedValue(new RegistrarError('PROVIDER_ERROR', 'secret-nameserver.example')),
    })
    const spy = vi.spyOn(console, 'error')
    await changeNameservers('u1', 'example.com', ['ns1.private.example', 'ns2.private.example'])
    expect(p.changeLock).not.toHaveBeenCalled()
    expect(JSON.stringify(spy.mock.calls)).not.toContain('private.example')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret-nameserver.example')
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
