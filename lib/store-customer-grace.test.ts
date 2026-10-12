import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/notify', () => ({ claimNotification: vi.fn(async () => true), sendTransactionalEmail: vi.fn() }))
vi.mock('@/lib/store-order-notifications', () => ({ findContactEmail: vi.fn(() => '') }))

const anonymize = vi.fn()
const blocking = vi.fn()
const deletedEmail = vi.fn()
vi.mock('@/lib/store-customer-deletion', () => ({
  anonymizeStoreCustomer: (...a: unknown[]) => anonymize(...a),
  customerHasBlockingOrders: (...a: unknown[]) => blocking(...a),
  sendAccountDeletedEmail: (...a: unknown[]) => deletedEmail(...a),
}))

type Result = { data?: unknown; error?: { code?: string; message?: string } | null }
type Call = { table: string; op: string; payload?: unknown; filters: string[] }

const calls: Call[] = []
let handler: (c: Call) => Result = () => ({ data: [], error: null })

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] }
  const settle = () => {
    calls.push(call)
    return Promise.resolve(handler(call))
  }
  const b: Record<string, unknown> = {}
  for (const f of ['eq', 'is', 'not', 'lte', 'gt', 'order', 'limit', 'select']) {
    b[f] = (...args: unknown[]) => {
      call.filters.push(`${f}:${args.map(String).join(',')}`)
      return b
    }
  }
  b.update = (p: unknown) => {
    call.op = 'update'
    call.payload = p
    return b
  }
  b.insert = (p: unknown) => {
    call.op = 'insert'
    call.payload = p
    return settle()
  }
  b.maybeSingle = settle
  b.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) => settle().then(resolve, reject)
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => builder(t) }) }))

import {
  finalizeDueCustomerDeletions,
  restoreStoreCustomer,
  suspendStoreCustomer,
} from '@/lib/store-customer-grace'
import {
  addDaysIso,
  buildRestorePatch,
  buildSuspendPatch,
  daysRemaining,
  isDeletionUrgent,
  isPendingDeletion,
  parseCustomerStatus,
} from '@/lib/store-customer-privacy'
import { authenticateSessionToken } from '@/lib/store-session-token'

beforeEach(() => {
  calls.length = 0
  anonymize.mockReset()
  blocking.mockReset()
  deletedEmail.mockReset()
  handler = () => ({ data: [], error: null })
})

describe('grace helpers', () => {
  it('schedules exactly 30 days out and kills sessions and reset links', () => {
    const now = '2026-01-01T00:00:00.000Z'
    const patch = buildSuspendPatch(now)
    expect(patch.deletion_scheduled_at).toBe(addDaysIso(now, 30))
    expect(patch.reset_token_hash).toBeNull()
    expect(patch.password_changed_at).toBe(now)
    expect(buildRestorePatch()).toEqual({
      deletion_requested_at: null,
      deletion_scheduled_at: null,
      deletion_requested_by: null,
    })
  })

  it('classifies pending accounts and counts days', () => {
    const future = '2026-01-31T00:00:00.000Z'
    expect(isPendingDeletion({ deletion_scheduled_at: future })).toBe(true)
    expect(isPendingDeletion({ deletion_scheduled_at: future, anonymized_at: future })).toBe(false)
    expect(isPendingDeletion({ deletion_scheduled_at: future, deleted_at: future })).toBe(false)
    expect(isPendingDeletion({})).toBe(false)
    const now = Date.parse('2026-01-29T12:00:00.000Z')
    expect(daysRemaining(future, now)).toBe(2)
    expect(isDeletionUrgent(future, now)).toBe(true)
    expect(daysRemaining(future, Date.parse('2026-03-01T00:00:00.000Z'))).toBe(0)
    expect(parseCustomerStatus('pending_deletion')).toBe('pending_deletion')
    expect(parseCustomerStatus('x')).toBe('active')
  })

  it('treats a suspended account as having no valid session', async () => {
    const find = async () => ({ password_changed_at: null, deletion_scheduled_at: '2026-02-01T00:00:00.000Z' })
    expect(await authenticateSessionToken('anything', 'p1', find)).toBeNull()
  })
})

describe('suspendStoreCustomer', () => {
  it('refuses while an order is in flight', async () => {
    handler = () => ({ data: { id: 'c1', email: 'a@b.co', name: 'A', deleted_at: null, deletion_scheduled_at: null }, error: null })
    blocking.mockResolvedValue(true)
    expect(await suspendStoreCustomer({ projectId: 'p', customerId: 'c1' })).toEqual({ ok: false, reason: 'blocked' })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('rejects an already suspended account', async () => {
    handler = () => ({ data: { id: 'c1', email: 'a@b.co', name: 'A', deleted_at: null, deletion_scheduled_at: '2026-02-01T00:00:00Z' }, error: null })
    expect(await suspendStoreCustomer({ projectId: 'p', customerId: 'c1' })).toEqual({ ok: false, reason: 'already_pending' })
  })

  it('guards the UPDATE so a concurrent suspension cannot double-apply', async () => {
    handler = (c) =>
      c.op === 'update'
        ? { data: [{ id: 'c1' }], error: null }
        : { data: { id: 'c1', email: 'a@b.co', name: 'A', deleted_at: null, deletion_scheduled_at: null }, error: null }
    blocking.mockResolvedValue(false)
    const res = await suspendStoreCustomer({ projectId: 'p', customerId: 'c1', actorUserId: 'u1' })
    expect(res.ok).toBe(true)
    const update = calls.find((c) => c.op === 'update')!
    expect(update.filters).toContain('is:deletion_scheduled_at,null')
    expect(update.filters).toContain('is:deleted_at,null')
    expect(calls.some((c) => c.table === 'store_customer_events' && (c.payload as { event: string }).event === 'suspended_by_owner')).toBe(true)
  })
})

describe('restoreStoreCustomer', () => {
  it('rejects an expired suspension at the database level', async () => {
    handler = (c) =>
      c.op === 'update'
        ? { data: [], error: null }
        : { data: { id: 'c1', email: 'a@b.co', name: 'A', deleted_at: null, anonymized_at: null, deletion_scheduled_at: '2020-01-01T00:00:00Z' }, error: null }
    expect(await restoreStoreCustomer({ projectId: 'p', customerId: 'c1' })).toEqual({ ok: false, reason: 'not_restorable' })
    const update = calls.find((c) => c.op === 'update')!
    expect(update.filters.some((f) => f.startsWith('gt:deletion_scheduled_at'))).toBe(true)
  })

  it('refuses an anonymized account without touching it', async () => {
    handler = () => ({ data: { id: 'c1', email: 'x', name: '', deleted_at: '2026-01-01', anonymized_at: '2026-01-01', deletion_scheduled_at: null }, error: null })
    expect(await restoreStoreCustomer({ projectId: 'p', customerId: 'c1' })).toEqual({ ok: false, reason: 'not_restorable' })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('refuses an account that was never suspended', async () => {
    handler = () => ({ data: { id: 'c1', email: 'x', name: '', deleted_at: null, anonymized_at: null, deletion_scheduled_at: null }, error: null })
    expect(await restoreStoreCustomer({ projectId: 'p', customerId: 'c1' })).toEqual({ ok: false, reason: 'not_pending' })
  })
})

describe('finalizeDueCustomerDeletions', () => {
  const due = (id: string) => ({ id, project_id: 'p', deletion_scheduled_at: '2026-01-01T00:00:00.000Z' })

  beforeEach(() => {
    handler = (c) => (c.op === 'select' ? { data: [due('a'), due('b'), due('c'), due('d')], error: null } : { data: [{ id: 'x' }], error: null })
  })

  it('wipes due accounts with the due-date guard and counts each outcome', async () => {
    anonymize
      .mockResolvedValueOnce({ ok: true, previousEmail: 'a@b.co', previousName: 'A', notificationsScrubbed: true })
      .mockResolvedValueOnce({ ok: false, reason: 'blocked' })
      .mockResolvedValueOnce({ ok: false, reason: 'already_deleted' })
      .mockRejectedValueOnce(new Error('boom'))
    const summary = await finalizeDueCustomerDeletions({ now: new Date('2026-02-01T00:00:00.000Z') })
    expect(summary).toMatchObject({ due: 4, finalized: 1, postponed: 1, skipped: 1, failed: 1, truncated: false })
    expect(anonymize.mock.calls[0][0]).toMatchObject({
      event: 'finalized_after_grace',
      suspendedOnly: { dueBefore: '2026-02-01T00:00:00.000Z' },
    })
    expect(deletedEmail).toHaveBeenCalledTimes(1)
    const postponed = calls.find((c) => c.op === 'update')!
    expect((postponed.payload as { deletion_scheduled_at: string }).deletion_scheduled_at).toBe('2026-01-08T00:00:00.000Z')
    expect(postponed.filters).toContain('eq:deletion_scheduled_at,2026-01-01T00:00:00.000Z')
  })

  it('stops at the time budget and leaves the rest for the next run', async () => {
    anonymize.mockResolvedValue({ ok: false, reason: 'already_deleted' })
    const summary = await finalizeDueCustomerDeletions({ budgetMs: -1 })
    expect(summary.truncated).toBe(true)
    expect(anonymize).not.toHaveBeenCalled()
  })

  it('is a no-op before the migration exists', async () => {
    handler = () => ({ data: null, error: { code: '42703', message: 'column does not exist' } })
    const summary = await finalizeDueCustomerDeletions()
    expect(summary.due).toBe(0)
  })
})
