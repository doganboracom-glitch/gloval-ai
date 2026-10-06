import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getFixedRates } from '../pricing/calc'

type Op = { table: string; op: 'insert' | 'update' | 'upsert'; payload: Record<string, unknown> }

const mocks = vi.hoisted(() => ({
  ops: [] as { table: string; op: 'insert' | 'update' | 'upsert'; payload: Record<string, unknown> }[],
  rows: {} as Record<string, Record<string, unknown>[]>,
  getUser: vi.fn(),
  createIntent: vi.fn(),
  listDomainsForUser: vi.fn(),
  loadPricingContext: vi.fn(),
  checkTransferIn: vi.fn(),
  getTransferPrice: vi.fn(),
  startTransferIn: vi.fn(),
  getOwnedDomainInfo: vi.fn(),
  setTransferLock: vi.fn(),
  getAuthCode: vi.fn(),
  finalizeTransferIn: vi.fn(),
  syncTransfersForUser: vi.fn(),
  insertError: null as null | { code: string },
}))

function makeBuilder(table: string) {
  const record = (op: Op['op']) => (payload: Record<string, unknown>) => {
    mocks.ops.push({ table, op, payload })
    return builder
  }
  const builder: Record<string, unknown> = {
    insert: record('insert'),
    update: record('update'),
    upsert: record('upsert'),
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () =>
      mocks.insertError ? { data: null, error: mocks.insertError } : { data: { id: 'tr-1' }, error: null },
    then: (resolve: (value: unknown) => unknown) => resolve({ data: mocks.rows[table] ?? [], error: null }),
  }
  return builder
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }) }))
vi.mock('@/lib/payments', () => ({
  getPlatformPaymentProvider: () => ({ createIntent: mocks.createIntent }),
  getPlatformPaymentProviderId: () => 'iyzico',
}))
vi.mock('@/lib/billing', () => ({}))
vi.mock('../service', () => ({ listDomainsForUser: mocks.listDomainsForUser }))
vi.mock('../pricing/context', () => ({ loadPricingContext: mocks.loadPricingContext }))
vi.mock('./provider', () => ({
  getDomainRegistrarProvider: () => ({
    checkTransferIn: mocks.checkTransferIn,
    getTransferPrice: mocks.getTransferPrice,
    startTransferIn: mocks.startTransferIn,
    getOwnedDomainInfo: mocks.getOwnedDomainInfo,
    setTransferLock: mocks.setTransferLock,
    getAuthCode: mocks.getAuthCode,
  }),
}))
vi.mock('./service', () => ({
  parsePurchaseDomain: (d: string) => (d.includes('.') ? { domain: d, tld: d.split('.').slice(1).join('.') } : null),
}))
vi.mock('./transfer-service', async () => {
  const actual = await vi.importActual<typeof import('./transfer-service')>('./transfer-service')
  return {
    ...actual,
    finalizeTransferIn: mocks.finalizeTransferIn,
    syncTransfersForUser: mocks.syncTransfersForUser,
  }
})

import {
  checkMyTransferIn,
  getMyTransferOutStatus,
  revealMyAuthCode,
  setMyTransferLock,
  startMyTransferIn,
} from './transfer-actions'

const EPP = 'EPP-SECRET-xyz-987'
const ops = (table: string, op?: Op['op']) => mocks.ops.filter((o) => o.table === table && (!op || o.op === op))
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

function ownedByUs(domain: string) {
  mocks.listDomainsForUser.mockResolvedValue([{ domain }])
  mocks.rows = { domain_orders: [{ id: 'o-1' }], domain_transfers: [] }
}

beforeEach(() => {
  process.env.DOMAIN_TRANSFER_SECRET = 'test-secret-with-enough-length'
  vi.clearAllMocks()
  mocks.ops.length = 0
  mocks.rows = {}
  mocks.insertError = null
  vi.spyOn(console, 'log').mockImplementation(() => {})
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'u@example.com' } } })
  mocks.listDomainsForUser.mockResolvedValue([])
  mocks.loadPricingContext.mockImplementation(async () => ({ vatBps: 2000, rates: getFixedRates(new Date()) }))
  mocks.checkTransferIn.mockResolvedValue({ transferable: true, authCodeValid: true, locked: false, reasonKey: null })
  // Distinct from any register price on purpose: 8.00 USD transfer.
  mocks.getTransferPrice.mockResolvedValue({ transferCents: 800, currency: 'USD' })
  mocks.createIntent.mockResolvedValue({
    status: 'pending',
    action: 'redirect',
    reference: 'pay-ref-1',
    redirectUrl: 'https://sandbox-pay.example/checkout',
  })
})

describe('transfer-in: eligibility', () => {
  it('rejects .tr extensions before any provider call', async () => {
    expect(await checkMyTransferIn('firma.com.tr', EPP)).toEqual({ ok: false, error: 'UNSUPPORTED_TLD' })
    expect(mocks.checkTransferIn).not.toHaveBeenCalled()
  })

  it.each(['', 'abc', 'x'.repeat(129)])('rejects an unusable EPP code (%#)', async (code) => {
    expect(await checkMyTransferIn('example.com', code)).toEqual({ ok: false, error: 'AUTH_CODE_REQUIRED' })
  })

  it('rejects an invalid EPP code reported by the provider', async () => {
    mocks.checkTransferIn.mockResolvedValue({ transferable: false, authCodeValid: false, locked: false, reasonKey: null })
    expect(await checkMyTransferIn('example.com', EPP)).toEqual({ ok: false, error: 'INVALID_AUTH_CODE' })
  })

  it('reports a locked domain', async () => {
    mocks.checkTransferIn.mockResolvedValue({ transferable: false, authCodeValid: true, locked: true, reasonKey: null })
    expect(await checkMyTransferIn('example.com', EPP)).toEqual({ ok: false, error: 'DOMAIN_LOCKED' })
  })

  it('reports a non-transferable domain even with a valid code', async () => {
    mocks.checkTransferIn.mockResolvedValue({ transferable: false, authCodeValid: true, locked: false, reasonKey: null })
    expect(await checkMyTransferIn('example.com', EPP)).toEqual({ ok: false, error: 'NOT_TRANSFERABLE' })
  })

  it('refuses a domain the user already has', async () => {
    mocks.listDomainsForUser.mockResolvedValue([{ domain: 'example.com' }])
    expect(await checkMyTransferIn('example.com', EPP)).toEqual({ ok: false, error: 'ALREADY_OWNED' })
  })

  it('maps provider exceptions to PROVIDER_ERROR without leaking the code', async () => {
    mocks.checkTransferIn.mockRejectedValue(new Error(`boom ${EPP}`))
    const res = await checkMyTransferIn('example.com', EPP)
    expect(res).toEqual({ ok: false, error: 'PROVIDER_ERROR' })
    expect(JSON.stringify(res)).not.toContain(EPP)
  })

  it('is unavailable (not silently plaintext) when DOMAIN_TRANSFER_SECRET is missing', async () => {
    delete process.env.DOMAIN_TRANSFER_SECRET
    expect(await checkMyTransferIn('example.com', EPP)).toEqual({ ok: false, error: 'NOT_CONFIGURED' })
  })
})

describe('transfer-in: pricing', () => {
  it('blocks when the provider has no transfer price (null) and never falls back to the register price', async () => {
    mocks.getTransferPrice.mockResolvedValue(null)
    expect(await checkMyTransferIn('example.com', EPP)).toEqual({ ok: false, error: 'PRICING_UNAVAILABLE' })
    const started = await startMyTransferIn('example.com', EPP)
    expect(started).toEqual({ ok: false, error: 'PRICING_UNAVAILABLE' })
    expect(ops('domain_transfers', 'insert')).toHaveLength(0)
    expect(mocks.createIntent).not.toHaveBeenCalled()
  })

  it('charges the transfer price: 8 USD * 50 = 400 TRY cost, +50% margin, +20% VAT = 720.00 TRY', async () => {
    const result = await startMyTransferIn('example.com', EPP)
    expect(result).toEqual({ ok: true, transferId: 'tr-1', redirectUrl: 'https://sandbox-pay.example/checkout' })

    const [insert] = ops('domain_transfers', 'insert')
    expect(insert.payload).toMatchObject({ user_id: 'user-1', status: 'pending_payment', price_cents: 72_000, currency: 'TRY' })
    expect(insert.payload.price_snapshot).toMatchObject({
      providerCostMinor: 800,
      providerCurrency: 'USD',
      fxRateMicros: 50_000_000,
      marginBps: 5000,
      vatBps: 2000,
      grossTryMinor: 72_000,
    })
    expect(mocks.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'domtrf_tr-1', amountCents: 72_000, currency: 'TRY' }),
    )
  })

  it('stores the EPP code only encrypted and never in the intent, ledger or client response', async () => {
    const result = await startMyTransferIn('example.com', EPP)
    expect(JSON.stringify(result)).not.toContain(EPP)
    const [insert] = ops('domain_transfers', 'insert')
    expect(insert.payload.auth_code_enc).toBeTruthy()
    expect(insert.payload.auth_code_enc).not.toContain(EPP)
    expect(JSON.stringify(mocks.createIntent.mock.calls)).not.toContain(EPP)
    expect(JSON.stringify(ops('billing_transactions'))).not.toContain(EPP)
  })

  it('does not submit the transfer before payment completes', async () => {
    await startMyTransferIn('example.com', EPP)
    expect(mocks.startTransferIn).not.toHaveBeenCalled()
    expect(mocks.finalizeTransferIn).not.toHaveBeenCalled()
  })

  it('reports PENDING_EXISTS on a duplicate open transfer (unique index)', async () => {
    mocks.insertError = { code: '23505' }
    expect(await startMyTransferIn('example.com', EPP)).toEqual({ ok: false, error: 'PENDING_EXISTS' })
    expect(mocks.createIntent).not.toHaveBeenCalled()
  })

  it('fails the order and clears the code when the payment provider throws', async () => {
    mocks.createIntent.mockRejectedValue(new Error('psp down'))
    expect(await startMyTransferIn('example.com', EPP)).toEqual({ ok: false, error: 'FAILED' })
    const failed = ops('domain_transfers', 'update').find((o) => o.payload.status === 'failed')
    expect(failed?.payload).toMatchObject({ status: 'failed', auth_code_enc: null, error_message: 'payment_init_failed' })
  })
})

describe('transfer-out: ownership', () => {
  it("rejects lock and EPP actions on another user's domain", async () => {
    mocks.listDomainsForUser.mockResolvedValue([])
    mocks.rows = { domain_orders: [{ id: 'o-1' }], domain_transfers: [] }
    expect(await setMyTransferLock('victim.com', false)).toEqual({ ok: false, error: 'NOT_FOUND' })
    expect(await revealMyAuthCode('victim.com')).toEqual({ ok: false, error: 'NOT_FOUND' })
    expect(mocks.setTransferLock).not.toHaveBeenCalled()
    expect(mocks.getAuthCode).not.toHaveBeenCalled()
    expect(mocks.getOwnedDomainInfo).not.toHaveBeenCalled()
  })

  it('rejects a connected-but-not-registered-here domain (no active order or completed transfer)', async () => {
    mocks.listDomainsForUser.mockResolvedValue([{ domain: 'connected.com' }])
    mocks.rows = { domain_orders: [], domain_transfers: [] }
    expect(await setMyTransferLock('connected.com', false)).toEqual({ ok: false, error: 'NOT_FOUND' })
    expect(mocks.setTransferLock).not.toHaveBeenCalled()
  })

  it('requires authentication', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    await expect(revealMyAuthCode('example.com')).rejects.toThrow('UNAUTHENTICATED')
    expect(mocks.getAuthCode).not.toHaveBeenCalled()
  })

  it('does not expose transfer-out for .tr domains', async () => {
    ownedByUs('firma.com.tr')
    expect(await getMyTransferOutStatus('firma.com.tr')).toEqual({ ok: true, supported: false, reason: 'UNSUPPORTED_TLD' })
    expect(await revealMyAuthCode('firma.com.tr')).toEqual({ ok: false, error: 'UNSUPPORTED_TLD' })
    expect(mocks.getAuthCode).not.toHaveBeenCalled()
  })
})

describe('transfer-out: lock, 60-day rule and EPP code', () => {
  it('refuses lock changes as UNSUPPORTED without any provider call (OTE: OK reply, state unchanged)', async () => {
    ownedByUs('example.com')
    expect(await setMyTransferLock('example.com', false)).toEqual({ ok: false, error: 'UNSUPPORTED' })
    expect(await setMyTransferLock('example.com', true)).toEqual({ ok: false, error: 'UNSUPPORTED' })
    expect(mocks.setTransferLock).not.toHaveBeenCalled()
  })

  it('withholds the EPP code inside the 60-day window', async () => {
    ownedByUs('example.com')
    mocks.getOwnedDomainInfo.mockResolvedValue({ locked: false, expiresAt: null, startedAt: daysAgo(10), status: 'Active', hasAuthCode: true })
    expect(await revealMyAuthCode('example.com')).toEqual({ ok: false, error: 'RESTRICTED_60_DAYS' })
    expect(mocks.getAuthCode).not.toHaveBeenCalled()
  })

  it('withholds the EPP code while the domain is locked', async () => {
    ownedByUs('example.com')
    mocks.getOwnedDomainInfo.mockResolvedValue({ locked: true, expiresAt: null, startedAt: daysAgo(90), status: 'Active', hasAuthCode: true })
    expect(await revealMyAuthCode('example.com')).toEqual({ ok: false, error: 'DOMAIN_LOCKED' })
    expect(mocks.getAuthCode).not.toHaveBeenCalled()
  })

  it('returns the EPP code only to the owner once unlocked and past 60 days', async () => {
    ownedByUs('example.com')
    mocks.getOwnedDomainInfo.mockResolvedValue({ locked: false, expiresAt: null, startedAt: daysAgo(90), status: 'Active', hasAuthCode: true })
    mocks.getAuthCode.mockResolvedValue(EPP)
    expect(await revealMyAuthCode('example.com')).toEqual({ ok: true, authCode: EPP })
  })

  it('never reports success when the provider returns no code or errors', async () => {
    ownedByUs('example.com')
    mocks.getOwnedDomainInfo.mockResolvedValue({ locked: false, expiresAt: null, startedAt: daysAgo(90), status: 'Active', hasAuthCode: false })
    mocks.getAuthCode.mockResolvedValue(null)
    expect(await revealMyAuthCode('example.com')).toEqual({ ok: false, error: 'NOT_FOUND' })
    mocks.getAuthCode.mockRejectedValue(new Error('x'))
    expect(await revealMyAuthCode('example.com')).toEqual({ ok: false, error: 'PROVIDER_ERROR' })
  })
})

describe('package independence', () => {
  it('transfer actions never consult plan or website entitlement', () => {
    const src = readFileSync(new URL('./transfer-actions.ts', import.meta.url), 'utf8')
    expect(src).not.toMatch(/getDomainEntitlement|getMyCurrentPlan|getMySubscription|canUse|custom-domains\/access/)
  })
})
