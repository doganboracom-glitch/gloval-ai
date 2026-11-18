import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  user: { id: 'u1', email: 'a@example.com' } as { id: string; email: string } | null,
  insertResult: { data: { id: 'r1' }, error: null } as { data: unknown; error: { code: string } | null },
  quote: vi.fn(),
  createIntent: vi.fn(),
  finalizeRenewal: vi.fn(),
  inserts: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<Record<string, unknown>>,
  persistedPriceOverride: null as number | null,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }))
vi.mock('@/lib/platform-buyer', () => ({
  resolvePlatformBuyerPublicConfig: async () => ({ buyer: { fullName: 'Ali Veli' } }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      chain.insert = (values: Record<string, unknown>) => {
        m.inserts.push(values)
        return chain
      }
      for (const name of ['select', 'update', 'eq']) chain[name] = () => chain
      chain.single = () => {
        if (m.insertResult.error || !m.insertResult.data) return Promise.resolve(m.insertResult)
        const inserted = m.inserts.at(-1)
        const row = m.insertResult.data as Record<string, unknown>
        return Promise.resolve({
          data: {
            ...row,
            price_cents: m.persistedPriceOverride ?? inserted?.price_cents,
            currency: inserted?.currency,
            price_snapshot: inserted?.price_snapshot,
          },
          error: null,
        })
      }
      chain.upsert = (values: Record<string, unknown>) => {
        m.upserts.push(values)
        return Promise.resolve({ data: null, error: null })
      }
      chain.then = (resolve: (r: unknown) => unknown) => resolve({ data: null, error: null })
      return chain
    },
  }),
}))
vi.mock('@/lib/payments', () => ({
  getPlatformPaymentProviderId: () => 'iyzico',
  getPlatformPaymentProvider: () => ({ createIntent: m.createIntent }),
}))
vi.mock('./renewal-service', () => ({
  quoteRenewal: (...a: unknown[]) => m.quote(...a),
  finalizeRenewal: (id: string) => m.finalizeRenewal(id),
  getLatestRenewal: vi.fn(),
}))

import { startMyDomainRenewal } from './renew-actions'

const consents = { preInfo: true, distance: true, withdrawal: true }
const displayedQuote = { grossMinor: 70_200, currency: 'TRY' }
const startRenewal = (expectedQuote = displayedQuote) =>
  startMyDomainRenewal('example.com', 1, consents, undefined, expectedQuote)

const quote = {
  ok: true,
  quote: {
    domain: 'example.com',
    tld: 'com',
    years: 1,
    totalGrossMinor: 70_200,
    paymentCurrency: 'TRY',
    snapshot: { grossTryMinor: 70_200 },
    baselineExpiresRaw: '2027-01-01T00:00:00',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  m.user = { id: 'u1', email: 'a@example.com' }
  m.insertResult = { data: { id: 'r1' }, error: null }
  m.inserts = []
  m.upserts = []
  m.persistedPriceOverride = null
  m.quote.mockResolvedValue(quote)
  m.createIntent.mockResolvedValue({ status: 'pending', action: 'redirect', reference: 'tok_1', redirectUrl: 'https://pay.example/x' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('startMyDomainRenewal', () => {
  it('rejects an anonymous caller before pricing or inserting anything', async () => {
    m.user = null
    expect(await startRenewal()).toEqual({ ok: false, error: 'UNAUTHENTICATED' })
    expect(m.quote).not.toHaveBeenCalled()
    expect(m.inserts).toHaveLength(0)
  })

  it('a second open renewal hits the unique index and opens no payment', async () => {
    m.insertResult = { data: null, error: { code: '23505' } }
    expect(await startRenewal()).toEqual({ ok: false, error: 'RENEWAL_IN_PROGRESS' })
    expect(m.createIntent).not.toHaveBeenCalled()
    expect(m.finalizeRenewal).not.toHaveBeenCalled()
  })

  it('blocks a changed customer quote before inserting a renewal', async () => {
    expect(await startRenewal({ grossMinor: 70_199, currency: 'TRY' })).toEqual({
      ok: false,
      error: 'PRICING_UNAVAILABLE',
    })
    expect(m.inserts).toHaveLength(0)
    expect(m.createIntent).not.toHaveBeenCalled()
  })

  it('charges the server-computed amount and never renews before the payment is confirmed', async () => {
    const res = await startRenewal()
    expect(res).toEqual({ ok: true, renewalId: 'r1', redirectUrl: 'https://pay.example/x' })
    expect(m.createIntent).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 70_200, currency: 'TRY', orderId: 'domren_r1' }))
    expect(m.inserts[0]).toMatchObject({ status: 'pending_payment', price_cents: 70_200 })
    expect(m.finalizeRenewal).not.toHaveBeenCalled()
  })

  it('blocks payment when the persisted renewal amount differs from the quote', async () => {
    m.persistedPriceOverride = 70_201

    expect(await startRenewal()).toEqual({ ok: false, error: 'PRICING_UNAVAILABLE' })
    expect(m.createIntent).not.toHaveBeenCalled()
    expect(m.upserts).toHaveLength(0)
    expect(m.finalizeRenewal).not.toHaveBeenCalled()
  })

  it('writes the consent evidence on the renewal ledger row', async () => {
    await startRenewal()
    expect(m.upserts).toHaveLength(1)
    expect(m.upserts[0]).toMatchObject({
      idempotency_key: 'domren_r1',
      consent_pre_info: true,
      consent_distance: true,
      consent_withdrawal: true,
    })
    expect(typeof m.upserts[0].consent_version).toBe('string')
    expect(typeof m.upserts[0].consented_at).toBe('string')
  })

  it('a payment that cannot be opened fails the row and never reaches the registrar', async () => {
    m.createIntent.mockRejectedValue(new Error('psp down'))
    expect(await startRenewal()).toEqual({ ok: false, error: 'TEMPORARY_FAILURE' })
    expect(m.finalizeRenewal).not.toHaveBeenCalled()
  })
})
