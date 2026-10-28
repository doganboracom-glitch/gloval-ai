import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  updates: [] as Array<{ table: string; id: unknown; patch: Row; matched: number }>,
  retrieve: vi.fn(),
  settleCalls: [] as string[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      let patch: Row | null = null
      let max = Number.POSITIVE_INFINITY
      let order: { column: string; ascending: boolean } | null = null
      const api = {
        select: () => api,
        update(values: Row) {
          patch = values
          return api
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value)
          return api
        },
        gte(column: string, value: string) {
          filters.push((row) => String(row[column]) >= value)
          return api
        },
        not(column: string, _operator: string, value: unknown) {
          filters.push((row) => row[column] !== value)
          return api
        },
        or: () => api,
        order(column: string, options: { ascending: boolean }) {
          order = { column, ascending: options.ascending }
          return api
        },
        limit(count: number) {
          max = count
          return api
        },
        then(resolve: (value: { data: Row[] | null; error: null }) => unknown) {
          let rows = (h.tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
          if (patch) {
            for (const row of rows) Object.assign(row, patch)
            h.updates.push({ table, id: rows[0]?.id, patch, matched: rows.length })
            return resolve({ data: null, error: null })
          }
          if (order) {
            const { column, ascending } = order
            rows = [...rows].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1))
          }
          return resolve({ data: rows.slice(0, max).map((row) => ({ ...row })), error: null })
        },
      }
      return api
    },
  }),
}))

vi.mock('./iyzico', () => ({ retrieveIyzicoCheckoutForm: (token: string) => h.retrieve(token) }))

// Mirrors the production guarantee (conditional claim from pending/abandoned): the first verified
// result flips the row, any replay finds nothing left to claim.
vi.mock('./settle', () => ({
  settlePaymentResult: async (_provider: string, result: { reference: string; status: string }) => {
    const row = (h.tables.billing_transactions ?? []).find((r) => r.provider_ref === result.reference)
    if (row && (row.status === 'pending' || row.status === 'abandoned')) {
      row.status = result.status === 'paid' ? 'succeeded' : 'failed'
      h.settleCalls.push(result.reference)
    }
    return 'credit_topup'
  },
}))

import { closePendingCheckoutForUser, reconcilePendingPayments } from './reconcile-store'

const NOW = Date.now()
const iso = (agoMs: number) => new Date(NOW - agoMs).toISOString()
const MIN = 60 * 1000
const HOUR = 60 * MIN

const A = 'user_a'
const B = 'user_b'

function ledger(id: string, userId: string, status: string, agoMs: number): Row {
  return {
    id,
    user_id: userId,
    status,
    provider: 'iyzico',
    provider_ref: `tok_${id}`,
    idempotency_key: `topup_ai_100_${id}`,
    created_at: iso(agoMs),
  }
}

const row = (id: string) => (h.tables.billing_transactions ?? []).find((r) => r.id === id)!

const paid = { paid: true, status: 'SUCCESS', raw: { status: 'success', paymentStatus: 'SUCCESS' } }
const noPayment = {
  paid: false,
  status: 'failure',
  raw: { status: 'failure', errorCode: '5122', errorMessage: 'Gönderilen tokena ait ödeme bilgisi bulunamadı' },
}
const threeDsInFlight = { paid: false, status: 'INIT_THREEDS', raw: { status: 'success', paymentStatus: 'INIT_THREEDS' } }
const unknownToken = { paid: false, status: 'failure', raw: { status: 'failure', errorCode: '5124', errorMessage: 'token bulunamadı' } }
const explicitFailure = { paid: false, status: 'FAILURE', raw: { status: 'success', paymentStatus: 'FAILURE' } }

beforeEach(() => {
  h.tables = { billing_transactions: [], addon_purchases: [] }
  h.updates = []
  h.settleCalls = []
  h.retrieve.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('closePendingCheckoutForUser', () => {
  const since = () => NOW - 10 * MIN

  it('abandons the record when iyzico reports no payment on the token (errorCode 5122)', async () => {
    h.tables.billing_transactions = [ledger('t1', A, 'pending', 2 * MIN)]
    h.retrieve.mockResolvedValue(noPayment)
    expect(await closePendingCheckoutForUser(A, since())).toBe('abandoned')
    expect(row('t1').status).toBe('abandoned')
  })

  it('abandons on an explicit paymentStatus FAILURE', async () => {
    h.tables.billing_transactions = [ledger('t1', A, 'pending', 2 * MIN)]
    h.retrieve.mockResolvedValue(explicitFailure)
    expect(await closePendingCheckoutForUser(A, since())).toBe('abandoned')
    expect(row('t1').status).toBe('abandoned')
  })

  it('settles a record that was in fact paid and never abandons it', async () => {
    h.tables.billing_transactions = [ledger('t1', A, 'pending', 2 * MIN)]
    h.retrieve.mockResolvedValue(paid)
    expect(await closePendingCheckoutForUser(A, since())).toBe('paid')
    expect(row('t1').status).toBe('succeeded')
    expect(h.updates.filter((u) => u.patch.status === 'abandoned')).toHaveLength(0)
  })

  it('leaves the record pending while 3D Secure is in flight', async () => {
    h.tables.billing_transactions = [ledger('t1', A, 'pending', 2 * MIN)]
    h.retrieve.mockResolvedValue(threeDsInFlight)
    expect(await closePendingCheckoutForUser(A, since())).toBe('unchanged')
    expect(row('t1').status).toBe('pending')
    expect(h.updates).toHaveLength(0)
  })

  it('leaves the record pending when the token is unknown to iyzico (ambiguous)', async () => {
    h.tables.billing_transactions = [ledger('t1', A, 'pending', 2 * MIN)]
    h.retrieve.mockResolvedValue(unknownToken)
    expect(await closePendingCheckoutForUser(A, since())).toBe('unchanged')
    expect(row('t1').status).toBe('pending')
  })

  it.each([
    ['network error', () => h.retrieve.mockRejectedValue(new Error('network down'))],
    [
      'credential/signature error',
      () => h.retrieve.mockResolvedValue({ paid: false, status: 'failure', raw: { status: 'failure', errorMessage: 'Invalid signature' } }),
    ],
  ])('leaves the record untouched on a transient iyzico error (%s)', async (_label, arrange) => {
    h.tables.billing_transactions = [ledger('t1', A, 'pending', 2 * MIN)]
    arrange()
    expect(await closePendingCheckoutForUser(A, since())).toBe('unchanged')
    expect(row('t1').status).toBe('pending')
    expect(h.updates).toHaveLength(0)
  })

  it('is safe to call twice: the second call finds nothing pending and writes nothing', async () => {
    h.tables.billing_transactions = [ledger('t1', A, 'pending', 2 * MIN)]
    h.retrieve.mockResolvedValue(noPayment)
    expect(await closePendingCheckoutForUser(A, since())).toBe('abandoned')
    expect(await closePendingCheckoutForUser(A, since())).toBe('none')
    expect(h.updates).toHaveLength(1)
    expect(h.retrieve).toHaveBeenCalledTimes(1)
  })

  it('settles a paid record only once across two calls', async () => {
    h.tables.billing_transactions = [ledger('t1', A, 'pending', 2 * MIN)]
    h.retrieve.mockResolvedValue(paid)
    expect(await closePendingCheckoutForUser(A, since())).toBe('paid')
    expect(await closePendingCheckoutForUser(A, since())).toBe('none')
    expect(h.settleCalls).toEqual(['tok_t1'])
  })

  it('never reads or touches another user\'s record, even a newer one', async () => {
    h.tables.billing_transactions = [ledger('mine', A, 'pending', 8 * MIN), ledger('theirs', B, 'pending', 1 * MIN)]
    h.retrieve.mockResolvedValue(noPayment)
    expect(await closePendingCheckoutForUser(A, since())).toBe('abandoned')
    expect(h.retrieve).toHaveBeenCalledTimes(1)
    expect(h.retrieve).toHaveBeenCalledWith('tok_mine')
    expect(row('mine').status).toBe('abandoned')
    expect(row('theirs').status).toBe('pending')
  })

  it('returns none, without calling iyzico, when only another user has a pending record', async () => {
    h.tables.billing_transactions = [ledger('theirs', B, 'pending', 1 * MIN)]
    expect(await closePendingCheckoutForUser(A, since())).toBe('none')
    expect(h.retrieve).not.toHaveBeenCalled()
    expect(row('theirs').status).toBe('pending')
  })

  it('ignores the user\'s own records that started before the dialog was opened', async () => {
    h.tables.billing_transactions = [ledger('old', A, 'pending', 3 * HOUR)]
    expect(await closePendingCheckoutForUser(A, since())).toBe('none')
    expect(h.retrieve).not.toHaveBeenCalled()
  })
})

describe('abandoned records and a late SUCCESS', () => {
  it('abandon then SUCCESS via the cron settles exactly once; later sweeps do not process it again', async () => {
    h.tables.billing_transactions = [ledger('t1', A, 'pending', 2 * MIN)]
    h.retrieve.mockResolvedValue(noPayment)
    expect(await closePendingCheckoutForUser(A, NOW - 10 * MIN)).toBe('abandoned')

    h.retrieve.mockResolvedValue(paid)
    const first = await reconcilePendingPayments({ limit: 50 })
    expect(first).toMatchObject({ checked: 1, paid: 1 })
    expect(row('t1').status).toBe('succeeded')

    const second = await reconcilePendingPayments({ limit: 50 })
    expect(second.checked).toBe(0)
    expect(h.settleCalls).toEqual(['tok_t1'])
  })

  it('a callback that already settled the abandoned record wins; the cron then settles nothing', async () => {
    h.tables.billing_transactions = [ledger('t1', A, 'abandoned', 2 * MIN)]
    const { settlePaymentResult } = await import('./settle')
    await settlePaymentResult('iyzico', { kind: 'payment', reference: 'tok_t1', status: 'paid' })
    h.retrieve.mockResolvedValue(paid)
    const summary = await reconcilePendingPayments({ limit: 50 })
    expect(summary.checked).toBe(0)
    expect(h.settleCalls).toEqual(['tok_t1'])
  })

  it('the cron re-checks abandoned records from the last 24 hours only', async () => {
    h.tables.billing_transactions = [
      ledger('recent', A, 'abandoned', 23 * HOUR),
      ledger('stale', A, 'abandoned', 25 * HOUR),
    ]
    h.retrieve.mockResolvedValue(noPayment)
    const summary = await reconcilePendingPayments({ limit: 50 })
    expect(h.retrieve).toHaveBeenCalledTimes(1)
    expect(h.retrieve).toHaveBeenCalledWith('tok_recent')
    expect(summary).toMatchObject({ checked: 1, skippedAbandoned: 1 })
    expect(row('recent').status).toBe('abandoned')
    expect(row('stale').status).toBe('abandoned')
  })

  it('a verified SUCCESS on an abandoned record from 23 hours ago is settled', async () => {
    h.tables.billing_transactions = [ledger('recent', A, 'abandoned', 23 * HOUR)]
    h.retrieve.mockResolvedValue(paid)
    const summary = await reconcilePendingPayments({ limit: 50 })
    expect(summary).toMatchObject({ checked: 1, paid: 1 })
    expect(row('recent').status).toBe('succeeded')
  })

  it('never scans more than the run limit, so there is no unbounded scan', async () => {
    h.tables.billing_transactions = Array.from({ length: 80 }, (_, index) => ledger(`a${index}`, A, 'abandoned', (index + 1) * MIN))
    h.retrieve.mockResolvedValue(noPayment)
    const summary = await reconcilePendingPayments({ limit: 50 })
    expect(summary.checked).toBe(50)
    expect(h.retrieve).toHaveBeenCalledTimes(50)
  })

  it('does not re-abandon or fail an abandoned record on a non-paid verdict', async () => {
    h.tables.billing_transactions = [ledger('t1', A, 'abandoned', 2 * HOUR)]
    h.retrieve.mockResolvedValue(explicitFailure)
    const summary = await reconcilePendingPayments({ limit: 50 })
    expect(summary).toMatchObject({ checked: 1, skippedAbandoned: 1, failed: 0, abandoned: 0 })
    expect(h.updates).toHaveLength(0)
  })
})
