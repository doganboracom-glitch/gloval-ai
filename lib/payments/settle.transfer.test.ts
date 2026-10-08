import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  startTransferIn: vi.fn(),
}))

function makeBuilder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let mode: 'select' | 'update' = 'select'
  let patch: Row = {}
  let wantRows = false
  const run = () => {
    const matched = (state.db[table] ?? []).filter((r) => filters.every((f) => f(r)))
    if (mode === 'update') for (const r of matched) Object.assign(r, patch)
    return matched.map((r) => ({ ...r }))
  }
  const b: Record<string, unknown> = {
    select() {
      if (mode === 'update') wantRows = true
      return b
    },
    update(p: Row) {
      mode = 'update'
      patch = p
      return b
    },
    upsert() {
      return Promise.resolve({ data: null, error: null })
    },
    eq(c: string, v: unknown) {
      filters.push((r) => r[c] === v)
      return b
    },
    neq(c: string, v: unknown) {
      filters.push((r) => r[c] !== v)
      return b
    },
    in(c: string, vs: unknown[]) {
      filters.push((r) => vs.includes(r[c]))
      return b
    },
    limit() {
      return b
    },
    maybeSingle() {
      return Promise.resolve({ data: run()[0] ?? null, error: null })
    },
    then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
      const rows = run()
      return Promise.resolve({ data: mode === 'update' && !wantRows ? null : rows, error: null }).then(res, rej)
    },
  }
  return b
}

vi.mock('@/lib/plan-credit-instant-store', () => ({ grantPlanCreditsAfterPayment: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => makeBuilder(t) }) }))
vi.mock('@/lib/notify', () => ({ logUserEvent: vi.fn(async () => {}), formatTicketNumber: (s: string) => s }))
vi.mock('@/lib/custom-domains/provider', () => ({ getDomainProvider: () => ({ addDomain: vi.fn() }) }))
vi.mock('@/lib/custom-domains/registrar/provider', () => ({
  getDomainRegistrarProvider: () => ({
    startTransferIn: state.startTransferIn,
    getOwnedDomainInfo: vi.fn(),
    checkTransferIn: vi.fn(),
    getTransferPrice: vi.fn(),
    setTransferLock: vi.fn(),
    getAuthCode: vi.fn(),
  }),
}))

import { encryptAuthCode } from '@/lib/custom-domains/registrar/transfer-crypto'
import { settlePaymentResult } from './settle'
import type { PaymentWebhookResult } from './types'

const REF = 'tok_transfer_ref_0001'
const EPP = 'EPP-SECRET-xyz-987'
const transfer = () => state.db.domain_transfers[0]

function seed(status = 'pending_payment') {
  state.db = {
    billing_subscriptions: [],
    project_entitlements: [],
    domain_orders: [],
    billing_transactions: [{ user_id: 'user-1', provider_ref: REF, status: 'pending' }],
    domain_transfers: [
      {
        id: 't-1',
        user_id: 'user-1',
        domain: 'example.com',
        period_years: 1,
        status,
        price_cents: 72000,
        currency: 'TRY',
        payment_reference: REF,
        auth_code_enc: encryptAuthCode(EPP),
      },
    ],
  }
}

function paid(overrides: Partial<PaymentWebhookResult> = {}): PaymentWebhookResult {
  return {
    reference: REF,
    kind: 'payment',
    status: 'paid',
    paidAmountCents: 72000,
    paidCurrency: 'TRY',
    orderRef: 'domtrf_t-1',
    ...overrides,
  } as PaymentWebhookResult
}

beforeEach(() => {
  process.env.DOMAIN_TRANSFER_SECRET = 'test-secret-with-enough-length'
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  state.startTransferIn.mockResolvedValue({ providerStatus: 'pending' })
  seed()
})

describe('settlePaymentResult - inbound transfer', () => {
  it('starts the transfer after a matching payment and leaves it pending, not completed', async () => {
    expect(await settlePaymentResult('iyzico', paid({ paidCurrency: 'TL' }))).toBe('domain_purchase')
    expect(state.startTransferIn).toHaveBeenCalledTimes(1)
    expect(state.startTransferIn).toHaveBeenCalledWith('example.com', EPP, 1)
    expect(transfer().status).toBe('transfer_pending')
    expect(state.db.billing_transactions[0].status).toBe('succeeded')
  })

  it.each([
    ['amount', { paidAmountCents: 1 }],
    ['currency', { paidCurrency: 'USD' }],
    ['order reference', { orderRef: 'domtrf_other' }],
  ])('rejects a mismatched %s: payment_mismatch, code wiped, no provider call', async (_n, override) => {
    await settlePaymentResult('iyzico', paid(override as Partial<PaymentWebhookResult>))
    expect(state.startTransferIn).not.toHaveBeenCalled()
    expect(transfer().status).toBe('failed')
    expect(transfer().error_message).toBe('payment_mismatch')
    expect(transfer().auth_code_enc).toBeNull()
  })

  it('repeated and concurrent paid callbacks start the transfer exactly once', async () => {
    await Promise.all([
      settlePaymentResult('iyzico', paid()),
      settlePaymentResult('iyzico', paid()),
      settlePaymentResult('iyzico', paid()),
    ])
    await settlePaymentResult('iyzico', paid())
    expect(state.startTransferIn).toHaveBeenCalledTimes(1)
  })

  it('a failed callback cancels an unpaid transfer and wipes the code', async () => {
    await settlePaymentResult('iyzico', paid({ status: 'failed' }))
    expect(transfer().status).toBe('failed')
    expect(transfer().auth_code_enc).toBeNull()
    expect(state.startTransferIn).not.toHaveBeenCalled()
  })

  it.each(['transfer_pending', 'completed'])('a late failed callback does not alter a %s transfer', async (status) => {
    seed(status)
    state.db.billing_transactions[0].status = 'succeeded'
    await settlePaymentResult('iyzico', paid({ status: 'failed' }))
    expect(transfer().status).toBe(status)
    expect(state.db.billing_transactions[0].status).toBe('succeeded')
  })

  it('an unknown provider outcome after payment awaits reconciliation with a safe code only', async () => {
  state.startTransferIn.mockRejectedValue(new Error('domainnameapi:TRANSFER_EXCEPTION'))
  await settlePaymentResult('iyzico', paid())
  expect(transfer().status).toBe('transfer_reconciliation_required')
    expect(JSON.stringify(transfer())).not.toContain(EPP)
  })
})
