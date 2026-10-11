import { describe, expect, it, vi } from 'vitest'
import { computeCallbackHash, type PaytrCredentials } from '@/lib/store-payments/paytr-core'
import { processPaytrCallback } from '@/lib/store-payments/paytr-webhook'
import type { StoreWebhookDeps } from '@/lib/store-webhook-handler'

type OrderRow = {
  id: string
  project_id: string
  payment_ref: string
  payment_provider: string
  payment_status: string
  status: string
  total_cents: number
  currency: string
}

type Filter = { op: 'eq' | 'neq'; column: string; value: unknown }

/** In-memory stand-in for the Supabase builder used by the webhook handler. */
function fakeAdmin(rows: OrderRow[]) {
  const matches = (row: OrderRow, filters: Filter[]) =>
    filters.every((f) => {
      const actual = (row as Record<string, unknown>)[f.column]
      return f.op === 'eq' ? actual === f.value : actual !== f.value
    })

  function builder() {
    const filters: Filter[] = []
    let patch: Partial<OrderRow> | null = null
    const api = {
      select: () => api,
      update: (values: Partial<OrderRow>) => {
        patch = values
        return api
      },
      eq: (column: string, value: unknown) => {
        filters.push({ op: 'eq', column, value })
        return api
      },
      neq: (column: string, value: unknown) => {
        filters.push({ op: 'neq', column, value })
        return api
      },
      maybeSingle: async () => {
        const hit = rows.find((r) => matches(r, filters))
        return { data: hit ? { ...hit } : null }
      },
      then: (resolve: (value: { data: { id: string }[] }) => unknown) => {
        const hits = patch ? rows.filter((r) => matches(r, filters)) : []
        for (const hit of hits) Object.assign(hit, patch)
        return resolve({ data: hits.map((h) => ({ id: h.id })) })
      },
    }
    return api
  }

  return { from: () => builder() } as unknown as Parameters<typeof processPaytrCallback>[0]
}

const STORE_A: PaytrCredentials = {
  merchantId: '111111',
  merchantKey: 'STORE-A-MERCHANT-KEY',
  merchantSalt: 'STORE-A-MERCHANT-SALT',
  testMode: true,
}
const STORE_B: PaytrCredentials = {
  merchantId: '222222',
  merchantKey: 'STORE-B-MERCHANT-KEY',
  merchantSalt: 'STORE-B-MERCHANT-SALT',
  testMode: true,
}

function order(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'order-a1',
    project_id: 'project-a',
    payment_ref: 'REFA1',
    payment_provider: 'paytr',
    payment_status: 'pending',
    status: 'pending',
    total_cents: 5000,
    currency: 'TRY',
    ...overrides,
  }
}

function callbackBody(
  creds: PaytrCredentials,
  fields: { merchantOid?: string; status?: 'success' | 'failed'; totalAmount?: string },
  hashOverride?: string,
): string {
  const merchantOid = fields.merchantOid ?? 'REFA1'
  const status = fields.status ?? 'success'
  const totalAmount = fields.totalAmount ?? '5000'
  const hash = hashOverride ?? computeCallbackHash({ merchantOid, status, totalAmount }, creds.merchantSalt, creds.merchantKey)
  return new URLSearchParams({ merchant_oid: merchantOid, status, total_amount: totalAmount, hash }).toString()
}

function setup(rows: OrderRow[] = [order()]) {
  const deps = {
    finalizePaidStock: vi.fn(async () => ({ oversold: false })),
    releaseOrderStock: vi.fn(async () => undefined),
    notifyOrder: vi.fn(),
  } satisfies StoreWebhookDeps
  const loadFor = (creds: PaytrCredentials | null) => vi.fn(async () => creds)
  return { rows, deps, admin: fakeAdmin(rows), loadFor }
}

describe('processPaytrCallback', () => {
  it('a correctly signed success marks the order paid exactly once, taking stock and sending the email', async () => {
    const { rows, deps, admin, loadFor } = setup()
    const res = await processPaytrCallback(admin, 'project-a', callbackBody(STORE_A, {}), loadFor(STORE_A), deps)
    expect(res).toEqual({ outcome: 'paid', oversold: false })
    expect(rows[0].payment_status).toBe('paid')
    expect(rows[0].status).toBe('paid')
    expect(deps.finalizePaidStock).toHaveBeenCalledTimes(1)
    expect(deps.notifyOrder).toHaveBeenCalledTimes(1)
    expect(deps.notifyOrder).toHaveBeenCalledWith('order-a1')
  })

  it('a wrong hash leaves the order untouched', async () => {
    const { rows, deps, admin, loadFor } = setup()
    const body = callbackBody(STORE_A, {}, 'Zm9yZ2VkLWhhc2g=')
    const res = await processPaytrCallback(admin, 'project-a', body, loadFor(STORE_A), deps)
    expect(res).toEqual({ outcome: 'bad_hash' })
    expect(rows[0].payment_status).toBe('pending')
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
    expect(deps.releaseOrderStock).not.toHaveBeenCalled()
    expect(deps.notifyOrder).not.toHaveBeenCalled()
  })

  it('rejects a notification signed with ANOTHER store\u2019s keys', async () => {
    const { rows, deps, admin, loadFor } = setup()
    const res = await processPaytrCallback(
      admin,
      'project-a',
      callbackBody(STORE_B, {}),
      loadFor(STORE_A),
      deps,
    )
    expect(res).toEqual({ outcome: 'bad_hash' })
    expect(rows[0].payment_status).toBe('pending')
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
    expect(deps.notifyOrder).not.toHaveBeenCalled()
  })

  it('another store\u2019s validly signed callback can never settle this store\u2019s order', async () => {
    const { rows, deps, admin, loadFor } = setup([
      order(),
      order({ id: 'order-b1', project_id: 'project-b', payment_ref: 'REFB1' }),
    ])
    // Store B's own callback for B's own order, but routed to store A's scope
    // with A's credentials: signature fails.
    const asA = await processPaytrCallback(
      admin,
      'project-a',
      callbackBody(STORE_B, { merchantOid: 'REFB1' }),
      loadFor(STORE_A),
      deps,
    )
    expect(asA).toEqual({ outcome: 'bad_hash' })

    // Even if the credentials lookup were wrong (B's keys, A's scope), the
    // project-scoped order lookup still finds nothing.
    const crossScoped = await processPaytrCallback(
      admin,
      'project-a',
      callbackBody(STORE_B, { merchantOid: 'REFB1' }),
      loadFor(STORE_B),
      deps,
    )
    expect(crossScoped).toEqual({ outcome: 'order_not_found' })

    expect(rows.map((r) => r.payment_status)).toEqual(['pending', 'pending'])
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
  })

  it('rejects an underpayment (total_amount < order total) and leaves the order pending', async () => {
    const { rows, deps, admin, loadFor } = setup()
    const res = await processPaytrCallback(
      admin,
      'project-a',
      callbackBody(STORE_A, { totalAmount: '4999' }),
      loadFor(STORE_A),
      deps,
    )
    expect(res).toEqual({ outcome: 'rejected', reason: 'amount_mismatch' })
    expect(rows[0].payment_status).toBe('pending')
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
    expect(deps.notifyOrder).not.toHaveBeenCalled()
  })

  it('accepts an overpayment, e.g. an installment surcharge', async () => {
    const { rows, deps, admin, loadFor } = setup()
    const res = await processPaytrCallback(
      admin,
      'project-a',
      callbackBody(STORE_A, { totalAmount: '5300' }),
      loadFor(STORE_A),
      deps,
    )
    expect(res).toEqual({ outcome: 'paid', oversold: false })
    expect(rows[0].payment_status).toBe('paid')
  })

  it('a tampered amount (signed for 5000, sent as 1) fails the hash check', async () => {
    const { rows, deps, admin, loadFor } = setup()
    const signed = computeCallbackHash(
      { merchantOid: 'REFA1', status: 'success', totalAmount: '5000' },
      STORE_A.merchantSalt,
      STORE_A.merchantKey,
    )
    const res = await processPaytrCallback(
      admin,
      'project-a',
      callbackBody(STORE_A, { totalAmount: '1' }, signed),
      loadFor(STORE_A),
      deps,
    )
    expect(res).toEqual({ outcome: 'bad_hash' })
    expect(rows[0].payment_status).toBe('pending')
  })

  it('status=failed releases the reserved stock once and marks the order failed', async () => {
    const { rows, deps, admin, loadFor } = setup()
    const res = await processPaytrCallback(
      admin,
      'project-a',
      callbackBody(STORE_A, { status: 'failed' }),
      loadFor(STORE_A),
      deps,
    )
    expect(res).toEqual({ outcome: 'failed' })
    expect(rows[0].payment_status).toBe('failed')
    expect(deps.releaseOrderStock).toHaveBeenCalledTimes(1)
    expect(deps.releaseOrderStock).toHaveBeenCalledWith(expect.anything(), 'order-a1', { onlyUnpaid: true })
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
    expect(deps.notifyOrder).not.toHaveBeenCalled()
  })

  it('delivering the same success twice takes stock and sends the email only once', async () => {
    const { rows, deps, admin, loadFor } = setup()
    const body = callbackBody(STORE_A, {})
    const first = await processPaytrCallback(admin, 'project-a', body, loadFor(STORE_A), deps)
    const second = await processPaytrCallback(admin, 'project-a', body, loadFor(STORE_A), deps)
    expect(first).toEqual({ outcome: 'paid', oversold: false })
    expect(second).toEqual({ outcome: 'duplicate' })
    expect(rows[0].payment_status).toBe('paid')
    expect(deps.finalizePaidStock).toHaveBeenCalledTimes(1)
    expect(deps.notifyOrder).toHaveBeenCalledTimes(1)
  })

  it('a late signed failure cannot undo a paid order or release its stock', async () => {
    const { rows, deps, admin, loadFor } = setup([order({ payment_status: 'paid', status: 'paid' })])
    const res = await processPaytrCallback(
      admin,
      'project-a',
      callbackBody(STORE_A, { status: 'failed' }),
      loadFor(STORE_A),
      deps,
    )
    expect(res).toEqual({ outcome: 'ignored', reason: 'already_paid' })
    expect(rows[0].payment_status).toBe('paid')
    expect(deps.releaseOrderStock).not.toHaveBeenCalled()
  })

  it('does nothing for a malformed body or a store without (readable) credentials', async () => {
    const { rows, deps, admin, loadFor } = setup()
    expect(await processPaytrCallback(admin, 'project-a', 'garbage', loadFor(STORE_A), deps)).toEqual({
      outcome: 'invalid_payload',
    })
    expect(
      await processPaytrCallback(admin, 'project-a', callbackBody(STORE_A, {}), loadFor(null), deps),
    ).toEqual({ outcome: 'no_credentials' })
    const throwing = vi.fn(async () => {
      throw new Error('decrypt failed')
    })
    expect(await processPaytrCallback(admin, 'project-a', callbackBody(STORE_A, {}), throwing, deps)).toEqual({
      outcome: 'no_credentials',
    })
    expect(rows[0].payment_status).toBe('pending')
    expect(deps.finalizePaidStock).not.toHaveBeenCalled()
  })
})
