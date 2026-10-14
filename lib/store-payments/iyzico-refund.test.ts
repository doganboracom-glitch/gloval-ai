import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  REFUND_LEASE_MS,
  planRefundItems,
  readProgress,
  reconcileRefundFollowUps,
  refundIyzicoOrder,
  runRefundFollowUps,
  type RefundDeps,
} from '@/lib/store-payments/iyzico-refund'
import {
  CANCEL_PATH,
  REFUND_PATH,
  RETRIEVE_PATH,
  type FetchLike,
  type IyzicoCredentials,
  type RetrieveData,
} from '@/lib/store-payments/iyzico'
import { refundDisplay, refundErrorMessage } from '@/lib/store-refund-status'

const creds: IyzicoCredentials = { apiKey: 'key', secretKey: 'secret', environment: 'sandbox' }

const PAID_AT = '2026-03-10T09:00:00.000Z'
const SAME_DAY = Date.parse('2026-03-10T15:00:00.000Z')
const LATER = Date.parse('2026-03-12T10:00:00.000Z')
const RAW_SECRET = 'RAW-SECRET-card-4111-1111-1111-1111'

type Row = Record<string, unknown>

function paidOrder(over: Row = {}): Row {
  return {
    id: 'o1',
    project_id: 'p1',
    payment_provider: 'iyzico',
    payment_status: 'paid',
    status: 'paid',
    payment_ref: 'tok-1',
    provider_payment_id: 'pay-1',
    total_cents: 12550,
    currency: 'TRY',
    created_at: PAID_AT,
    refund_status: null,
    refund_items: null,
    refund_started_at: null,
    refund_error: null,
    refund_ref: null,
    refunded_at: null,
    stock_reserved: true,
    attention_at: null,
    attention_reason: null,
    ...over,
  }
}

/**
 * In-memory `ecommerce_orders`. Filters and writes of one statement run in a
 * single synchronous step, so conditional updates behave atomically like they
 * do in Postgres (which is what the claim relies on).
 */
function createOrdersDb(initial: Row[], failUpdate?: (values: Row) => boolean) {
  const rows = initial.map((r) => ({ ...r }))
  const writes: Row[] = []

  function builder() {
    const filters: ((r: Row) => boolean)[] = []
    let op: 'select' | 'update' = 'select'
    let values: Row = {}

    async function exec(single: boolean) {
      if (op === 'update' && failUpdate?.(values)) return { data: null, error: { code: '57014' } }
      const matched = rows.filter((r) => filters.every((f) => f(r)))
      if (op === 'update') {
        for (const r of matched) Object.assign(r, values)
        writes.push({ ...values })
        return { data: matched.map((r) => ({ id: r.id })), error: null }
      }
      const copies = matched.map((r) => ({ ...r }))
      return { data: single ? (copies[0] ?? null) : copies, error: null }
    }

    const api = {
      select: () => api,
      update: (v: Row) => ((op = 'update'), (values = v), api),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), api),
      is: (c: string, v: unknown) => (filters.push((r) => (v === null ? r[c] == null : r[c] === v)), api),
      lt: (c: string, v: unknown) => (filters.push((r) => r[c] != null && String(r[c]) < String(v)), api),
      or: (expr: string) => {
        const parts = expr.split(',').map((p) => {
          if (p.endsWith('.eq.true')) return (r: Row) => r[p.replace('.eq.true', '')] === true
          if (p.endsWith('.not.is.null')) return (r: Row) => r[p.replace('.not.is.null', '')] != null
          throw new Error(`unsupported or() part: ${p}`)
        })
        filters.push((r) => parts.some((f) => f(r)))
        return api
      },
      limit: () => api,
      maybeSingle: () => exec(true),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => exec(false).then(resolve, reject),
    }
    return api
  }

  return {
    client: { from: () => builder() } as never,
    rows,
    writes,
    row: (id = 'o1') => rows.find((r) => r.id === id) as Row,
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function retrieveBody(over: Row = {}) {
  return {
    status: 'success',
    paymentStatus: 'SUCCESS',
    conversationId: 'o1',
    basketId: 'o1',
    paymentId: 'pay-1',
    currency: 'TRY',
    price: '125.5',
    paidPrice: '125.5',
    itemTransactions: [
      { itemId: 'p1', paymentTransactionId: 'tx1', price: '100', paidPrice: '100' },
      { itemId: 'p2', paymentTransactionId: 'tx2', price: '25.5', paidPrice: '25.5' },
    ],
    ...over,
  }
}

type Body = Record<string, unknown>
type Handlers = {
  retrieve?: (body: Body) => Response | Promise<Response>
  cancel?: (body: Body) => Response | Promise<Response>
  refund?: (body: Body) => Response | Promise<Response>
}

/** A mock iyzico: routes by path, records every request body, can throw to simulate a timeout. */
function mockIyzico(h: Handlers = {}) {
  const calls = { retrieve: [] as Body[], cancel: [] as Body[], refund: [] as Body[] }
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname
    const body = JSON.parse(String(init?.body)) as Body
    if (path === RETRIEVE_PATH) {
      calls.retrieve.push(body)
      return (h.retrieve ?? (() => json(retrieveBody())))(body)
    }
    if (path === CANCEL_PATH) {
      calls.cancel.push(body)
      return (h.cancel ?? (() => json({ status: 'success', hostReference: 'host-cancel', paymentId: 'pay-1' })))(body)
    }
    if (path === REFUND_PATH) {
      calls.refund.push(body)
      return (
        h.refund ??
        ((b: Body) =>
          json({ status: 'success', hostReference: `ref-${String(b.paymentTransactionId)}`, paymentTransactionId: b.paymentTransactionId }))
      )(body)
    }
    throw new Error(`unexpected iyzico path ${path}`)
  })
  return { fetchImpl: fetchImpl as unknown as FetchLike, calls, spy: fetchImpl }
}

const timeout = () => {
  throw new TypeError('network timeout')
}

function makeDeps(over: Partial<RefundDeps> = {}) {
  const deps = {
    releaseStock: vi.fn(async () => true),
    notifyRefunded: vi.fn(async () => true),
    attention: { notifyAttention: vi.fn() },
    ...over,
  }
  return deps as typeof deps & RefundDeps
}

const input = { projectId: 'p1', orderId: 'o1' }

let consoleError: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('1. full refund: cancel and refund routes', () => {
  it('cancels the whole payment on the day of payment and only then finalizes the order', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico()
    const deps = makeDeps()

    const res = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: SAME_DAY })

    expect(res).toEqual({ ok: true, already: false, method: 'cancel', followUp: 'done' })
    expect(iy.calls.cancel).toHaveLength(1)
    expect(iy.calls.cancel[0].paymentId).toBe('pay-1')
    expect(iy.calls.refund).toHaveLength(0)
    expect(db.row()).toMatchObject({
      payment_status: 'refunded',
      status: 'cancelled',
      refund_status: 'succeeded',
      refund_ref: 'host-cancel',
      refund_error: null,
    })
    expect(typeof db.row().refunded_at).toBe('string')
    expect(deps.releaseStock).toHaveBeenCalledTimes(1)
    expect(deps.notifyRefunded).toHaveBeenCalledTimes(1)
    expect(deps.attention.notifyAttention).not.toHaveBeenCalled()
  })

  it('refunds each basket item on a later day, never cancelling', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico()
    const deps = makeDeps()

    const res = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: LATER })

    expect(res).toEqual({ ok: true, already: false, method: 'refund', followUp: 'done' })
    expect(iy.calls.cancel).toHaveLength(0)
    expect(iy.calls.refund.map((b) => [b.paymentTransactionId, b.price, b.currency])).toEqual([
      ['tx1', '100.0', 'TRY'],
      ['tx2', '25.5', 'TRY'],
    ])
    expect(db.row()).toMatchObject({ payment_status: 'refunded', status: 'cancelled', refund_ref: 'ref-tx1, ref-tx2' })
  })

  it('falls back to per-item refunds when iyzico refuses a same-day cancel', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico({ cancel: () => json({ status: 'failure', errorCode: '10223' }) })

    const res = await refundIyzicoOrder(db.client, creds, input, makeDeps(), { fetchImpl: iy.fetchImpl, now: SAME_DAY })

    expect(res).toMatchObject({ ok: true, method: 'refund' })
    expect(iy.calls.cancel).toHaveLength(1)
    expect(iy.calls.refund).toHaveLength(2)
    expect(db.row().payment_status).toBe('refunded')
  })

  it('reports follow-up trouble without undoing a refund that already happened', async () => {
    const db = createOrdersDb([paidOrder()])
    const deps = makeDeps({
      releaseStock: vi.fn(async () => false),
      notifyRefunded: vi.fn(async () => {
        throw new Error('smtp down')
      }),
    })
    const res = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: mockIyzico().fetchImpl, now: SAME_DAY })

    expect(res).toEqual({ ok: true, already: false, method: 'cancel', followUp: 'attention' })
    expect(db.row()).toMatchObject({ payment_status: 'refunded', refund_status: 'succeeded' })
    expect(db.row().attention_reason).toBe('release_stock')
    expect(deps.attention.notifyAttention).toHaveBeenCalledTimes(1)
  })
})

describe('2. iyzico refusal', () => {
  it('leaves the order exactly as it was and stores only the numeric code', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico({ refund: () => json({ status: 'failure', errorCode: '10237', errorMessage: 'Refund not allowed' }) })
    const deps = makeDeps()

    const res = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: LATER })

    expect(res).toEqual({ ok: false, error: 'rejected', rejectionCode: '10237' })
    expect(db.row()).toMatchObject({
      payment_status: 'paid',
      status: 'paid',
      stock_reserved: true,
      refund_status: 'failed',
      refund_error: '10237',
      refunded_at: null,
    })
    expect(deps.releaseStock).not.toHaveBeenCalled()
    expect(deps.notifyRefunded).not.toHaveBeenCalled()
    expect(iy.calls.refund).toHaveLength(1)
  })

  it('a failed refund can be retried as a clean attempt', async () => {
    const db = createOrdersDb([paidOrder()])
    let refuse = true
    const iy = mockIyzico({
      refund: (b) =>
        refuse
          ? json({ status: 'failure', errorCode: '10237' })
          : json({ status: 'success', hostReference: `ref-${String(b.paymentTransactionId)}` }),
    })
    const deps = makeDeps()

    const first = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: LATER })
    expect(first.ok).toBe(false)
    expect(db.row().refund_status).toBe('failed')

    refuse = false
    const second = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: LATER + 1000 })
    expect(second).toMatchObject({ ok: true, already: false, method: 'refund' })
    expect(db.row()).toMatchObject({ payment_status: 'refunded', refund_status: 'succeeded', refund_error: null })
    expect(deps.notifyRefunded).toHaveBeenCalledTimes(1)
  })

  it('rejected keys are a definitive failure, not a pending refund', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico({ refund: () => json({ status: 'failure', errorCode: '1000' }, 401) })
    const res = await refundIyzicoOrder(db.client, creds, input, makeDeps(), { fetchImpl: iy.fetchImpl, now: LATER })
    expect(res).toMatchObject({ ok: false, error: 'auth' })
    expect(db.row()).toMatchObject({ refund_status: 'failed', payment_status: 'paid' })
  })

  it('does not reverse anything when iyzico\'s record does not match the order', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico({ retrieve: () => json(retrieveBody({ price: '1.0', paidPrice: '1.0' })) })
    const res = await refundIyzicoOrder(db.client, creds, input, makeDeps(), { fetchImpl: iy.fetchImpl, now: SAME_DAY })
    expect(res).toMatchObject({ ok: false, error: 'amount_mismatch' })
    expect(iy.calls.cancel).toHaveLength(0)
    expect(iy.calls.refund).toHaveLength(0)
    expect(db.row().payment_status).toBe('paid')
  })

  it('refuses when the stored paymentId differs from the one iyzico reports', async () => {
    const db = createOrdersDb([paidOrder({ provider_payment_id: 'someone-elses' })])
    const iy = mockIyzico()
    const res = await refundIyzicoOrder(db.client, creds, input, makeDeps(), { fetchImpl: iy.fetchImpl, now: SAME_DAY })
    expect(res).toMatchObject({ ok: false, error: 'amount_mismatch' })
    expect(iy.calls.cancel).toHaveLength(0)
  })
})

describe('3. timeout, pending state and retry', () => {
  it('stays pending after a timeout and a retry never repeats an item that already succeeded', async () => {
    const db = createOrdersDb([paidOrder()])
    let failSecond = true
    const iy = mockIyzico({
      refund: (b) => {
        if (b.paymentTransactionId === 'tx2' && failSecond) return timeout()
        return json({ status: 'success', hostReference: `ref-${String(b.paymentTransactionId)}` })
      },
    })
    const deps = makeDeps()

    const first = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: LATER })
    expect(first).toMatchObject({ ok: false, error: 'unavailable' })
    expect(db.row()).toMatchObject({ refund_status: 'pending', refund_error: 'unknown', payment_status: 'paid' })
    expect(readProgress(db.row().refund_items)?.done.map((d) => d.id)).toEqual(['tx1'])
    expect(deps.notifyRefunded).not.toHaveBeenCalled()

    const early = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: LATER + 30_000 })
    expect(early).toEqual({ ok: false, error: 'in_progress' })
    expect(iy.calls.refund).toHaveLength(2)

    failSecond = false
    const retry = await refundIyzicoOrder(db.client, creds, input, deps, {
      fetchImpl: iy.fetchImpl,
      now: LATER + REFUND_LEASE_MS + 1000,
    })
    expect(retry).toMatchObject({ ok: true, method: 'refund' })
    const refundedIds = iy.calls.refund.map((b) => b.paymentTransactionId)
    expect(refundedIds.filter((id) => id === 'tx1')).toHaveLength(1)
    expect(refundedIds.filter((id) => id === 'tx2')).toHaveLength(2)
    expect(db.row()).toMatchObject({ payment_status: 'refunded', refund_status: 'succeeded', refund_ref: 'ref-tx1, ref-tx2' })
    expect(deps.releaseStock).toHaveBeenCalledTimes(1)
    expect(deps.notifyRefunded).toHaveBeenCalledTimes(1)
  })

  it('a timed-out cancel stays pending and nothing is finalized', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico({ cancel: () => timeout() })
    const deps = makeDeps()
    const res = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: SAME_DAY })
    expect(res).toMatchObject({ ok: false, error: 'unavailable' })
    expect(db.row()).toMatchObject({ refund_status: 'pending', payment_status: 'paid', status: 'paid' })
    expect(deps.releaseStock).not.toHaveBeenCalled()
  })

  it('a refusal after an unknown attempt asks the owner to verify instead of marking failed or refunded', async () => {
    const db = createOrdersDb([paidOrder()])
    let phase: 'timeout' | 'refuse' = 'timeout'
    const iy = mockIyzico({
      refund: () => (phase === 'timeout' ? timeout() : json({ status: 'failure', errorCode: '10237' })),
    })
    const deps = makeDeps()

    await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: LATER })
    phase = 'refuse'
    const retry = await refundIyzicoOrder(db.client, creds, input, deps, {
      fetchImpl: iy.fetchImpl,
      now: LATER + REFUND_LEASE_MS + 1000,
    })

    expect(retry).toMatchObject({ ok: false, error: 'verify_manually' })
    expect(db.row()).toMatchObject({ refund_status: 'pending', refund_error: 'verify', payment_status: 'paid' })
    expect(deps.releaseStock).not.toHaveBeenCalled()
    expect(deps.notifyRefunded).not.toHaveBeenCalled()
  })

  it('when iyzico refunded but the final order update failed, the retry finalizes without calling iyzico', async () => {
    let breakFinalize = true
    const db = createOrdersDb([paidOrder()], (v) => breakFinalize && v.refund_status === 'succeeded')
    const iy = mockIyzico()
    const deps = makeDeps()

    const first = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: SAME_DAY })
    expect(first).toEqual({ ok: false, error: 'finalize_failed' })
    expect(db.row()).toMatchObject({ payment_status: 'paid', refund_status: 'pending', attention_reason: 'refund_finalize' })
    expect(deps.attention.notifyAttention).toHaveBeenCalledTimes(1)
    expect(iy.calls.cancel).toHaveLength(1)

    breakFinalize = false
    iy.spy.mockClear()
    const retry = await refundIyzicoOrder(db.client, creds, input, deps, {
      fetchImpl: iy.fetchImpl,
      now: SAME_DAY + REFUND_LEASE_MS + 1000,
    })
    expect(retry).toMatchObject({ ok: true, method: 'cancel' })
    expect(iy.spy).not.toHaveBeenCalled()
    expect(db.row()).toMatchObject({ payment_status: 'refunded', refund_status: 'succeeded' })
  })
})

describe('4. double click and concurrent requests', () => {
  it('two simultaneous requests reach iyzico once and finish the order once', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico()
    const deps = makeDeps()
    const opts = { fetchImpl: iy.fetchImpl, now: SAME_DAY }

    const [a, b] = await Promise.all([
      refundIyzicoOrder(db.client, creds, input, deps, opts),
      refundIyzicoOrder(db.client, creds, input, deps, opts),
    ])

    const results = [a, b]
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: 'in_progress' }])
    expect(iy.calls.cancel).toHaveLength(1)
    expect(iy.calls.refund).toHaveLength(0)
    expect(deps.releaseStock).toHaveBeenCalledTimes(1)
    expect(deps.notifyRefunded).toHaveBeenCalledTimes(1)
  })

  it('five simultaneous multi-item requests refund every item exactly once', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico()
    const deps = makeDeps()
    const opts = { fetchImpl: iy.fetchImpl, now: LATER }

    const results = await Promise.all(Array.from({ length: 5 }, () => refundIyzicoOrder(db.client, creds, input, deps, opts)))

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(iy.calls.refund.map((b) => b.paymentTransactionId).sort()).toEqual(['tx1', 'tx2'])
    expect(deps.notifyRefunded).toHaveBeenCalledTimes(1)
  })

  it('a click after completion is a no-op that never reaches iyzico', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico()
    const deps = makeDeps()
    const opts = { fetchImpl: iy.fetchImpl, now: SAME_DAY }
    await refundIyzicoOrder(db.client, creds, input, deps, opts)
    iy.spy.mockClear()

    const again = await refundIyzicoOrder(db.client, creds, input, deps, opts)
    expect(again).toMatchObject({ ok: true, already: true, method: 'cancel', followUp: 'done' })
    expect(iy.spy).not.toHaveBeenCalled()
    expect(deps.notifyRefunded).toHaveBeenCalledTimes(1)
  })
})

describe('5. multi-item orders', () => {
  const base: RetrieveData = {
    status: 'success',
    paymentStatus: 'SUCCESS',
    conversationId: 'o1',
    basketId: 'o1',
    paymentId: 'pay-1',
    currency: 'TRY',
    priceCents: 12550,
    paidPriceCents: 12550,
    items: [
      { itemId: 'a', paymentTransactionId: 'tx1', paidPriceCents: 10000, priceCents: 10000 },
      { itemId: 'b', paymentTransactionId: 'tx2', paidPriceCents: 2550, priceCents: 2550 },
    ],
  }

  it('plans exactly what was paid per item', () => {
    expect(planRefundItems(base)).toEqual([
      { id: 'tx1', cents: 10000 },
      { id: 'tx2', cents: 2550 },
    ])
  })

  it('uses the paid price (with installment fee) and skips zero-value items', () => {
    const plan = planRefundItems({
      ...base,
      paidPriceCents: 13000,
      items: [
        { itemId: 'a', paymentTransactionId: 'tx1', paidPriceCents: 10400, priceCents: 10000 },
        { itemId: 'b', paymentTransactionId: 'tx2', paidPriceCents: 2600, priceCents: 2550 },
        { itemId: 'c', paymentTransactionId: 'tx3', paidPriceCents: 0, priceCents: 0 },
      ],
    })
    expect(plan).toEqual([
      { id: 'tx1', cents: 10400 },
      { id: 'tx2', cents: 2600 },
    ])
  })

  it('sends nothing when the item list does not add up to the payment', () => {
    expect(planRefundItems({ ...base, paidPriceCents: 99999 })).toBeNull()
    expect(planRefundItems({ ...base, items: [] })).toBeNull()
    expect(planRefundItems({ ...base, paidPriceCents: null })).toBeNull()
    expect(
      planRefundItems({ ...base, items: [{ itemId: 'a', paymentTransactionId: 'tx1', paidPriceCents: null, priceCents: null }] }),
    ).toBeNull()
  })

  it('an unreconcilable item list on the refund route fails without any reversal call', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico({
      retrieve: () =>
        json(
          retrieveBody({
            itemTransactions: [{ itemId: 'p1', paymentTransactionId: 'tx1', price: '10', paidPrice: '10' }],
          }),
        ),
    })
    const res = await refundIyzicoOrder(db.client, creds, input, makeDeps(), { fetchImpl: iy.fetchImpl, now: LATER })
    expect(res).toMatchObject({ ok: false, error: 'amount_mismatch' })
    expect(iy.calls.refund).toHaveLength(0)
    expect(db.row().payment_status).toBe('paid')
  })

  it('a refusal on the second item keeps the first item recorded so it is not refunded twice', async () => {
    const db = createOrdersDb([paidOrder()])
    let refuseSecond = true
    const iy = mockIyzico({
      refund: (b) =>
        b.paymentTransactionId === 'tx2' && refuseSecond
          ? json({ status: 'failure', errorCode: '10237' })
          : json({ status: 'success', hostReference: `ref-${String(b.paymentTransactionId)}` }),
    })
    const deps = makeDeps()
    await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: LATER })
    expect(readProgress(db.row().refund_items)?.done.map((d) => d.id)).toEqual(['tx1'])

    refuseSecond = false
    const res = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: LATER + 1000 })
    expect(res.ok).toBe(true)
    expect(iy.calls.refund.map((b) => b.paymentTransactionId)).toEqual(['tx1', 'tx2', 'tx2'])
  })
})

describe('6. bank transfer and cash on delivery are untouched', () => {
  it.each(['bank_transfer', 'cash_on_delivery'])('%s orders never reach iyzico or change', async (provider) => {
    const db = createOrdersDb([paidOrder({ payment_provider: provider, payment_ref: null, provider_payment_id: null })])
    const iy = mockIyzico()
    const deps = makeDeps()
    const res = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: SAME_DAY })
    expect(res).toEqual({ ok: false, error: 'not_card' })
    expect(iy.spy).not.toHaveBeenCalled()
    expect(db.writes).toHaveLength(0)
    expect(deps.releaseStock).not.toHaveBeenCalled()
    expect(deps.notifyRefunded).not.toHaveBeenCalled()
  })

  it('an unpaid card order has nothing to refund', async () => {
    const db = createOrdersDb([paidOrder({ payment_status: 'pending', status: 'pending' })])
    const iy = mockIyzico()
    const res = await refundIyzicoOrder(db.client, creds, input, makeDeps(), { fetchImpl: iy.fetchImpl, now: SAME_DAY })
    expect(res).toEqual({ ok: false, error: 'not_paid' })
    expect(iy.spy).not.toHaveBeenCalled()
    expect(db.writes).toHaveLength(0)
  })
})

describe('7. another store\'s order', () => {
  it('an order of a different project is not found and nothing is sent or written', async () => {
    const db = createOrdersDb([paidOrder({ project_id: 'other-project' })])
    const iy = mockIyzico()
    const deps = makeDeps()
    const res = await refundIyzicoOrder(db.client, creds, input, deps, { fetchImpl: iy.fetchImpl, now: SAME_DAY })
    expect(res).toEqual({ ok: false, error: 'not_found' })
    expect(iy.spy).not.toHaveBeenCalled()
    expect(db.writes).toHaveLength(0)
    expect(db.row()).toMatchObject({ payment_status: 'paid', refund_status: null })
    expect(deps.notifyRefunded).not.toHaveBeenCalled()
  })

  it('every conditional write is scoped to the owner\'s project', async () => {
    const db = createOrdersDb([paidOrder(), paidOrder({ id: 'o2', project_id: 'other-project' })])
    await refundIyzicoOrder(db.client, creds, input, makeDeps(), { fetchImpl: mockIyzico().fetchImpl, now: SAME_DAY })
    expect(db.row('o1').payment_status).toBe('refunded')
    expect(db.row('o2')).toMatchObject({ payment_status: 'paid', refund_status: null })
  })
})

describe('11. no raw iyzico response is stored or logged', () => {
  it('a non-numeric error code and free text never reach the order or the logs', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico({
      refund: () =>
        json({ status: 'failure', errorCode: `ERR-${RAW_SECRET}`, errorMessage: RAW_SECRET, errorGroup: RAW_SECRET }),
    })
    const res = await refundIyzicoOrder(db.client, creds, input, makeDeps(), { fetchImpl: iy.fetchImpl, now: LATER })

    expect(res).toEqual({ ok: false, error: 'rejected', rejectionCode: '' })
    expect(db.row().refund_error).toBe('rejected')
    for (const write of db.writes) {
      if (typeof write.refund_error === 'string') expect(write.refund_error).toMatch(/^[a-z0-9_]{1,40}$/)
    }
    expect(JSON.stringify(db.rows)).not.toContain('RAW-SECRET')
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('RAW-SECRET')
    const shown = refundErrorMessage(res.ok ? 'rejected' : res.error, res.ok ? '' : res.rejectionCode)
    expect(shown).not.toContain('RAW-SECRET')
  })

  it('an unknown outcome stores a short code, not the failure text', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico({ refund: () => new Response(`upstream said ${RAW_SECRET}`, { status: 502 }) })
    await refundIyzicoOrder(db.client, creds, input, makeDeps(), { fetchImpl: iy.fetchImpl, now: LATER })
    expect(db.row()).toMatchObject({ refund_status: 'pending', refund_error: 'unknown' })
    expect(JSON.stringify(db.rows)).not.toContain('RAW-SECRET')
  })

  it('only the digits of a numeric code are kept, and the owner text is a fixed message', async () => {
    const db = createOrdersDb([paidOrder()])
    const iy = mockIyzico({ refund: () => json({ status: 'failure', errorCode: '10223', errorMessage: RAW_SECRET }) })
    const res = await refundIyzicoOrder(db.client, creds, input, makeDeps(), { fetchImpl: iy.fetchImpl, now: LATER })
    expect(res).toMatchObject({ error: 'rejected', rejectionCode: '10223' })
    expect(db.row().refund_error).toBe('10223')
    expect(refundErrorMessage('rejected', '10223')).toContain('Banka gün sonu')
    expect(JSON.stringify(db.rows)).not.toContain('RAW-SECRET')
  })
})

describe('refund follow-ups', () => {
  it('flags the order and e-mails the owner once when stock release fails', async () => {
    const db = createOrdersDb([paidOrder({ payment_status: 'refunded', refund_status: 'succeeded' })])
    const deps = makeDeps({ releaseStock: vi.fn(async () => false) })
    const out = await runRefundFollowUps(db.client, deps, 'o1')
    expect(out).toBe('attention')
    expect(db.row().attention_reason).toBe('release_stock')
    expect(deps.notifyRefunded).toHaveBeenCalledTimes(1)
    await runRefundFollowUps(db.client, deps, 'o1')
    expect(deps.attention.notifyAttention).toHaveBeenCalledTimes(1)
  })

  it('a thrown e-mail error counts as not notified', async () => {
    const db = createOrdersDb([paidOrder({ payment_status: 'refunded', refund_status: 'succeeded' })])
    const deps = makeDeps({
      notifyRefunded: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    expect(await runRefundFollowUps(db.client, deps, 'o1')).toBe('attention')
    expect(db.row().attention_reason).toBe('refund_notify')
  })
})

describe('9. cron reconciliation never calls iyzico again', () => {
  const stale = new Date(LATER - REFUND_LEASE_MS - 60_000).toISOString()
  const fresh = new Date(LATER - 10_000).toISOString()
  const complete = { method: 'cancel', total: 1, done: [{ id: 'pay-1', ref: 'host-cancel' }] }
  const partial = { method: 'refund', total: 2, done: [{ id: 'tx1', ref: 'ref-tx1' }] }
  const opts = { deadlineMs: Date.now() + 60_000, now: LATER }

  it('finalizes a refund whose steps all succeeded, with no request to iyzico', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const db = createOrdersDb([paidOrder({ refund_status: 'pending', refund_started_at: stale, refund_items: complete })])
    const deps = makeDeps()

    const summary = await reconcileRefundFollowUps(db.client, deps, opts)

    expect(summary.finalized).toBe(1)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(db.row()).toMatchObject({
      payment_status: 'refunded',
      status: 'cancelled',
      refund_status: 'succeeded',
      refund_ref: 'host-cancel',
    })
    expect(deps.releaseStock).toHaveBeenCalled()
    expect(deps.notifyRefunded).toHaveBeenCalledTimes(1)
  })

  it('leaves unfinished refunds to the owner and never touches a refund still inside its lease', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const db = createOrdersDb([
      paidOrder({ id: 'partial', refund_status: 'pending', refund_started_at: stale, refund_items: partial }),
      paidOrder({ id: 'noprogress', refund_status: 'pending', refund_started_at: stale, refund_items: null }),
      paidOrder({ id: 'leased', refund_status: 'pending', refund_started_at: fresh, refund_items: complete }),
    ])
    const deps = makeDeps()

    const summary = await reconcileRefundFollowUps(db.client, deps, opts)

    expect(summary.finalized).toBe(0)
    expect(summary.skipped).toBe(2)
    expect(fetchSpy).not.toHaveBeenCalled()
    for (const id of ['partial', 'noprogress', 'leased']) {
      expect(db.row(id)).toMatchObject({ payment_status: 'paid', refund_status: 'pending' })
    }
    expect(deps.notifyRefunded).not.toHaveBeenCalled()
  })

  it('retries stock and clears the flag for a refunded order, e-mailing only when the e-mail was the failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const flagged = { payment_status: 'refunded', refund_status: 'succeeded', attention_at: PAID_AT }
    const db = createOrdersDb([
      paidOrder({ id: 'stock', ...flagged, attention_reason: 'release_stock' }),
      paidOrder({ id: 'mail', ...flagged, attention_reason: 'refund_notify', stock_reserved: false }),
    ])
    const deps = makeDeps()

    const summary = await reconcileRefundFollowUps(db.client, deps, opts)

    expect(summary.followedUp).toBe(2)
    expect(deps.notifyRefunded).toHaveBeenCalledTimes(1)
    expect(deps.notifyRefunded).toHaveBeenCalledWith('mail')
    expect(db.row('stock').attention_at).toBeNull()
    expect(db.row('mail').attention_at).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps the flag while the e-mail still fails', async () => {
    const db = createOrdersDb([
      paidOrder({
        payment_status: 'refunded',
        refund_status: 'succeeded',
        attention_at: PAID_AT,
        attention_reason: 'refund_notify',
      }),
    ])
    const deps = makeDeps({ notifyRefunded: vi.fn(async () => false) })
    const summary = await reconcileRefundFollowUps(db.client, deps, opts)
    expect(summary.followedUp).toBe(0)
    expect(db.row().attention_at).toBe(PAID_AT)
  })

  it('reports a pending refund as pending to the owner and a finished one as refunded', () => {
    expect(refundDisplay({ payment_status: 'paid', refund_status: 'pending' })).toBe('pending')
    expect(refundDisplay({ payment_status: 'refunded', refund_status: 'succeeded' })).toBe('refunded')
    expect(refundDisplay({ payment_status: 'paid', refund_status: 'failed' })).toBe('failed')
    expect(refundDisplay({ payment_status: 'paid', refund_status: null })).toBe('none')
  })
})
