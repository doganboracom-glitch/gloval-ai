import { beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data: unknown; error: null }

const m = vi.hoisted(() => ({
  provider: null as unknown,
  /** Results handed out, in order, to each awaited query chain. */
  results: [] as Array<{ data: unknown; error: null }>,
  /** Every `.update(values)` payload, in call order. */
  updates: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      for (const name of ['select', 'eq', 'lt', 'order', 'limit', 'maybeSingle']) chain[name] = self
      chain.update = (values: Record<string, unknown>) => {
        m.updates.push(values)
        return chain
      }
      chain.then = (resolve: (r: Result) => unknown) => resolve(m.results.shift() ?? { data: [], error: null })
      return chain
    },
  }),
}))
vi.mock('./provider', () => ({ getDomainRegistrarProvider: () => m.provider }))
vi.mock('../pricing/context', () => ({ loadPricingContext: async () => ({}) }))
vi.mock('../pricing/order', () => ({ resolveOrderPricing: vi.fn() }))
vi.mock('./manage-service', () => ({ guard: vi.fn(), toDomainError: vi.fn() }))
vi.mock('./transfer-service', () => ({ STALE_PENDING_MS: 1000 }))

import { finalizeRenewal, reconcileRenewals, sweepStaleRenewals } from './renewal-service'
import { RegistrarError } from './types'

const row = {
  id: 'r1',
  user_id: 'u1',
  domain: 'example.com',
  period_years: 1,
  baseline_expires_raw: '2027-01-01T00:00:00Z',
}

function provider(over: Record<string, unknown> = {}) {
  return {
    getManagedDetails: vi.fn(),
    checkTransferIn: vi.fn(),
    getOwnedDomainInfo: vi.fn().mockResolvedValue({ expiresAtRaw: '2027-01-01T00:00:00Z' }),
    renewDomain: vi.fn().mockResolvedValue({ expiresAtRaw: '2028-01-01T00:00:00Z' }),
    ...over,
  }
}

const lastStatus = () => m.updates[m.updates.length - 1]?.status

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  m.provider = provider()
  m.results = []
  m.updates = []
})

describe('finalizeRenewal', () => {
  it('does nothing when another worker already claimed the row', async () => {
    m.results = [{ data: [], error: null }]
    await finalizeRenewal('r1')
    expect((m.provider as ReturnType<typeof provider>).renewDomain).not.toHaveBeenCalled()
  })

  it('calls Renew exactly once and completes with the provider expiry', async () => {
    m.results = [{ data: [row], error: null }]
    await finalizeRenewal('r1')
    const p = m.provider as ReturnType<typeof provider>
    expect(p.renewDomain).toHaveBeenCalledTimes(1)
    expect(p.renewDomain).toHaveBeenCalledWith('example.com', 1)
    expect(m.updates[m.updates.length - 1]).toMatchObject({
      status: 'completed',
      provider_expires_raw: '2028-01-01T00:00:00Z',
    })
  })

  it('does not renew again when the provider expiry already moved past the baseline', async () => {
    m.provider = provider({ getOwnedDomainInfo: vi.fn().mockResolvedValue({ expiresAtRaw: '2028-01-01T00:00:00Z' }) })
    m.results = [{ data: [row], error: null }]
    await finalizeRenewal('r1')
    expect((m.provider as ReturnType<typeof provider>).renewDomain).not.toHaveBeenCalled()
    expect(lastStatus()).toBe('completed')
  })

  it('a definite provider rejection becomes manual_refund_required, never retried', async () => {
    m.provider = provider({ renewDomain: vi.fn().mockRejectedValue(new RegistrarError('PROVIDER_ERROR')) })
    m.results = [{ data: [row], error: null }]
    await finalizeRenewal('r1')
    expect((m.provider as ReturnType<typeof provider>).renewDomain).toHaveBeenCalledTimes(1)
    expect(lastStatus()).toBe('manual_refund_required')
  })

  it('an uncertain outcome goes to reconciliation, never back to a retryable state', async () => {
    m.provider = provider({ renewDomain: vi.fn().mockRejectedValue(new RegistrarError('OUTCOME_UNKNOWN')) })
    m.results = [{ data: [row], error: null }]
    await finalizeRenewal('r1')
    expect((m.provider as ReturnType<typeof provider>).renewDomain).toHaveBeenCalledTimes(1)
    expect(lastStatus()).toBe('renewal_reconciliation_required')
  })

  it('a non-registrar exception is treated as uncertain, not as a refund', async () => {
    m.provider = provider({ renewDomain: vi.fn().mockRejectedValue(new Error('socket hang up')) })
    m.results = [{ data: [row], error: null }]
    await finalizeRenewal('r1')
    expect(lastStatus()).toBe('renewal_reconciliation_required')
  })

  it('an unavailable registrar after payment needs a manual refund and sends nothing', async () => {
    m.provider = null
    m.results = [{ data: [row], error: null }]
    await finalizeRenewal('r1')
    expect(lastStatus()).toBe('manual_refund_required')
  })

  it('concurrent callbacks send exactly one Renew: only the caller that wins the claim proceeds', async () => {
    // The database claim (payment_verified -> renewal_submitting) hands the row
    // to one caller and an empty set to the other.
    m.results = [
      { data: [row], error: null },
      { data: [], error: null },
    ]
    await Promise.all([finalizeRenewal('r1'), finalizeRenewal('r1')])
    expect((m.provider as ReturnType<typeof provider>).renewDomain).toHaveBeenCalledTimes(1)
  })

  it('never throws, so the payment callback can always acknowledge the PSP', async () => {
    m.results = [{ data: [row], error: null }]
    m.provider = provider({ getOwnedDomainInfo: vi.fn().mockRejectedValue(new Error('boom')) })
    await expect(finalizeRenewal('r1')).resolves.toBeUndefined()
  })
})

describe('reconcileRenewals', () => {
  const pending = { id: 'r1', domain: 'example.com', baseline_expires_raw: '2027-01-01T00:00:00Z' }

  it('completes only when the expiry is observed past the baseline, and never calls Renew', async () => {
    m.provider = provider({ getOwnedDomainInfo: vi.fn().mockResolvedValue({ expiresAtRaw: '2028-01-01T00:00:00Z' }) })
    m.results = [
      { data: [pending], error: null },
      { data: [{ id: 'r1' }], error: null },
    ]
    expect(await reconcileRenewals()).toEqual({ checked: 1, completed: 1 })
    expect((m.provider as ReturnType<typeof provider>).renewDomain).not.toHaveBeenCalled()
  })

  it('leaves the row open when the expiry has not moved', async () => {
    m.results = [{ data: [pending], error: null }]
    expect(await reconcileRenewals()).toEqual({ checked: 1, completed: 0 })
    expect(m.updates.some((u) => u.status === 'completed')).toBe(false)
  })

  it('leaves the row open when the provider cannot be read', async () => {
    m.provider = provider({ getOwnedDomainInfo: vi.fn().mockRejectedValue(new Error('down')) })
    m.results = [{ data: [pending], error: null }]
    expect(await reconcileRenewals()).toEqual({ checked: 1, completed: 0 })
    expect(m.updates.some((u) => u.status === 'completed')).toBe(false)
  })
})

describe('sweepStaleRenewals', () => {
  it('cancels unpaid rows and sends a row stuck in submitting to reconciliation, never to a retry', async () => {
    m.results = [
      { data: [{ id: 'a' }], error: null },
      { data: [{ id: 'b' }, { id: 'c' }], error: null },
      { data: [], error: null },
    ]
    expect(await sweepStaleRenewals(1)).toBe(3)
    expect(m.updates).toEqual([
      { status: 'cancelled', error_message: 'payment_not_completed' },
      { status: 'renewal_reconciliation_required', error_message: 'submitting_timeout' },
    ])
    expect((m.provider as ReturnType<typeof provider>).renewDomain).not.toHaveBeenCalled()
  })

  it('re-drives a paid but unclaimed row through the normal claim path, which Renews once', async () => {
    m.results = [
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ id: 'r1' }], error: null },
      { data: [row], error: null },
    ]
    expect(await sweepStaleRenewals(1)).toBe(1)
    expect((m.provider as ReturnType<typeof provider>).renewDomain).toHaveBeenCalledTimes(1)
    expect(lastStatus()).toBe('completed')
  })
})
