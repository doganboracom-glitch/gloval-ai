import { describe, expect, it, vi } from 'vitest'
import {
  MAX_SETTLE_ATTEMPTS,
  clearOrderAttention,
  needsAttention,
  recordSettleFailure,
} from '@/lib/store-order-attention'
import { createQueryFake, type QueryCall, type QueryResult } from '@/lib/test-support/query-fake'

function setup(row: Record<string, unknown> | null, update?: (c: QueryCall) => QueryResult | undefined) {
  const fake = createQueryFake((call) => {
    if (call.op === 'select') return { data: row }
    return update?.(call) ?? { data: null }
  })
  const deps = { notifyAttention: vi.fn() }
  return { ...fake, deps }
}

const input = { orderId: 'o1', projectId: 'p1', step: 'mark_paid' }

describe('recordSettleFailure', () => {
  it('counts a failure below the threshold without flagging or mailing', async () => {
    const { client, deps, calls } = setup({ settle_attempts: 0, attention_at: null })
    const res = await recordSettleFailure(client, input, deps)
    expect(res).toEqual({ recorded: true, attempts: 1, escalated: false })
    expect(calls.find((c) => c.op === 'update')?.values).toEqual({ settle_attempts: 1 })
    expect(deps.notifyAttention).not.toHaveBeenCalled()
  })

  it('flags the order and mails the owner once at the threshold', async () => {
    const { client, deps, calls } = setup({ settle_attempts: MAX_SETTLE_ATTEMPTS - 1, attention_at: null })
    const res = await recordSettleFailure(client, input, deps)
    expect(res).toEqual({ recorded: true, attempts: MAX_SETTLE_ATTEMPTS, escalated: true })
    const patch = calls.find((c) => c.op === 'update')?.values as Record<string, unknown>
    expect(patch.attention_reason).toBe('mark_paid')
    expect(typeof patch.attention_at).toBe('string')
    expect(deps.notifyAttention).toHaveBeenCalledWith('o1')
  })

  it('does not mail again once the order is already flagged', async () => {
    const { client, deps } = setup({ settle_attempts: 7, attention_at: '2026-01-01T00:00:00Z' })
    const res = await recordSettleFailure(client, input, deps)
    expect(res).toEqual({ recorded: true, attempts: 8, escalated: false })
    expect(deps.notifyAttention).not.toHaveBeenCalled()
  })

  it('is a no-op while the migration is not applied', async () => {
    const fake = createQueryFake(() => ({ error: { code: '42703' } }))
    const deps = { notifyAttention: vi.fn() }
    expect(await recordSettleFailure(fake.client, input, deps)).toEqual({
      recorded: false,
      reason: 'unsupported',
    })
    expect(fake.calls.filter((c) => c.op === 'update')).toHaveLength(0)
  })

  it('reports an error and does not mail when the counter cannot be read or written', async () => {
    const read = createQueryFake(() => ({ error: { code: '57014' } }))
    const deps = { notifyAttention: vi.fn() }
    expect(await recordSettleFailure(read.client, input, deps)).toEqual({ recorded: false, reason: 'error' })

    const write = setup({ settle_attempts: MAX_SETTLE_ATTEMPTS - 1, attention_at: null }, () => ({
      error: { code: '40001' },
    }))
    expect(await recordSettleFailure(write.client, input, write.deps)).toEqual({
      recorded: false,
      reason: 'error',
    })
    expect(write.deps.notifyAttention).not.toHaveBeenCalled()
  })

  it('still records the flag when the owner e-mail throws', async () => {
    const { client, deps } = setup({ settle_attempts: MAX_SETTLE_ATTEMPTS - 1, attention_at: null })
    deps.notifyAttention.mockRejectedValueOnce(new Error('smtp down'))
    const res = await recordSettleFailure(client, input, deps)
    expect(res).toEqual({ recorded: true, attempts: MAX_SETTLE_ATTEMPTS, escalated: true })
  })
})

describe('clearOrderAttention', () => {
  it('resets the flag and counter', async () => {
    const { client, calls } = setup(null)
    await clearOrderAttention(client, 'o1')
    expect(calls[0].values).toEqual({ attention_at: null, attention_reason: null, settle_attempts: 0 })
  })

  it('never throws on a database error', async () => {
    const { client } = setup(null, () => ({ error: { code: '08006' } }))
    await expect(clearOrderAttention(client, 'o1')).resolves.toBeUndefined()
  })
})

describe('needsAttention', () => {
  it('is true only for a flagged order that is still unfinished', () => {
    const flagged = { attention_at: '2026-01-01T00:00:00Z', status: 'pending', payment_status: 'pending' }
    expect(needsAttention(flagged)).toBe(true)
    expect(needsAttention({ ...flagged, payment_status: 'paid' })).toBe(false)
    expect(needsAttention({ ...flagged, status: 'cancelled' })).toBe(false)
    expect(needsAttention({ ...flagged, attention_at: null })).toBe(false)
  })
})
