import { beforeEach, describe, expect, it, vi } from 'vitest'

const TX_A = '33333333-3333-4333-8333-333333333333'
const TX_B = '44444444-4444-4444-8444-444444444444'
const INV_A = '22222222-2222-4222-8222-222222222222'
const INV_B = '66666666-6666-4666-8666-666666666666'

type Row = { id: string; billing_transaction_id: string; status: string; not_required_reason: string | null }

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  rows: [] as unknown[],
  lookupError: null as { message: string } | null,
  deleteResult: { data: [{ id: 'x' }], error: null } as { data: unknown[] | null; error: { message: string } | null },
  deleteCalls: [] as Array<Array<[string, unknown]>>,
}))

vi.mock('@/lib/invoices/audit', () => ({ recordInvoiceAudit: mocks.audit }))
vi.mock('@/lib/invoices/provider', () => ({ getInvoiceProvider: () => ({ issue: vi.fn() }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      let deleting = false
      const filters: Array<[string, unknown]> = []
      const builder: Record<string, unknown> = {
        select: () => builder,
        in: () => Promise.resolve({ data: mocks.rows, error: mocks.lookupError }),
        delete: () => ((deleting = true), mocks.deleteCalls.push(filters), builder),
        eq: (column: string, value: unknown) => (filters.push([column, value]), builder),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(deleting ? mocks.deleteResult : { data: null }).then(resolve, reject),
      }
      return builder
    },
  }),
}))

import { reopenNotRequired } from '@/lib/invoices/service'

const actor = { userId: 'admin-1', email: 'admin@example.com' }
const notRequired = (id: string, tx: string, reason = 'Müşteri istemedi'): Row => ({ id, billing_transaction_id: tx, status: 'not_required', not_required_reason: reason })

describe('reopenNotRequired', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.deleteCalls.length = 0
    mocks.lookupError = null
    mocks.rows = [notRequired(INV_A, TX_A)]
    mocks.deleteResult = { data: [{ id: INV_A }], error: null }
    mocks.audit.mockResolvedValue(true)
  })

  it('rejects malformed, duplicate and oversized input before any lookup', async () => {
    await expect(reopenNotRequired(actor, 'x')).resolves.toEqual({ ok: false, error: 'invalid_input' })
    await expect(reopenNotRequired(actor, [])).resolves.toEqual({ ok: false, error: 'invalid_input' })
    await expect(reopenNotRequired(actor, ['not-a-uuid'])).resolves.toEqual({ ok: false, error: 'invalid_input' })
    await expect(reopenNotRequired(actor, [TX_A, TX_A])).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('deletes only a not_required row (conditional on status) and audits first, without identity data', async () => {
    const result = await reopenNotRequired(actor, [TX_A])
    expect(result).toEqual({ ok: true, reopened: 1, skipped: [] })
    expect(mocks.deleteCalls[0]).toEqual([
      ['id', INV_A],
      ['status', 'not_required'],
    ])
    expect(mocks.audit).toHaveBeenCalledTimes(1)
    const entry = mocks.audit.mock.calls[0][0]
    expect(entry).toMatchObject({ action: 'invoice.reopen', invoiceId: INV_A, billingTransactionId: TX_A })
    expect(entry.detail).toEqual({ outcome: 'attempt', previousReason: 'Müşteri istemedi', billingTransactionId: TX_A, bulk: false })
  })

  it('refuses an uploaded invoice and changes nothing, even when mixed with valid rows', async () => {
    mocks.rows = [notRequired(INV_A, TX_A), { id: INV_B, billing_transaction_id: TX_B, status: 'uploaded', not_required_reason: null }]
    const result = await reopenNotRequired(actor, [TX_A, TX_B])
    expect(result).toEqual({ ok: false, error: 'not_reopenable' })
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.deleteCalls).toHaveLength(0)
  })

  it('skips payments that have no invoices row (already pending)', async () => {
    mocks.rows = [notRequired(INV_A, TX_A)]
    const result = await reopenNotRequired(actor, [TX_A, TX_B])
    expect(result).toEqual({ ok: true, reopened: 1, skipped: [{ transactionId: TX_B, reason: 'not_found' }] })
  })

  it('does not delete when the audit entry cannot be written, and stops the rest of the batch', async () => {
    mocks.rows = [notRequired(INV_A, TX_A), notRequired(INV_B, TX_B)]
    mocks.audit.mockResolvedValue(false)
    const result = await reopenNotRequired(actor, [TX_A, TX_B])
    expect(result).toEqual({ ok: false, error: 'audit_failed' })
    expect(mocks.deleteCalls).toHaveLength(0)
    expect(mocks.audit).toHaveBeenCalledTimes(1)
  })

  it('reports save_failed (and records the abort) when the delete matches nothing, e.g. uploaded in the meantime', async () => {
    mocks.deleteResult = { data: [], error: null }
    const result = await reopenNotRequired(actor, [TX_A])
    expect(result).toEqual({ ok: true, reopened: 0, skipped: [{ transactionId: TX_A, reason: 'save_failed' }] })
    expect(mocks.audit.mock.calls[1][0].detail).toEqual({ outcome: 'aborted_delete_failed', billingTransactionId: TX_A })
  })

  it('reports save_failed when the database rejects the delete (guard trigger)', async () => {
    mocks.deleteResult = { data: null, error: { message: 'only not_required invoices can be deleted' } }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await reopenNotRequired(actor, [TX_A])
    expect(result).toEqual({ ok: true, reopened: 0, skipped: [{ transactionId: TX_A, reason: 'save_failed' }] })
  })

  it('returns unavailable when the lookup fails', async () => {
    mocks.lookupError = { message: 'down' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(reopenNotRequired(actor, [TX_A])).resolves.toEqual({ ok: false, error: 'unavailable' })
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})
