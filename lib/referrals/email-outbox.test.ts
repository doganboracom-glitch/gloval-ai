import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  afterCallbacks: [] as Array<() => void | Promise<void>>,
  insertError: null as { code?: string; message?: string } | null,
  send: vi.fn(),
  sequence: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('next/server', () => ({
  after: (callback: () => void | Promise<void>) => state.afterCallbacks.push(callback),
}))
vi.mock('@/lib/notify', () => ({
  sendTransactionalEmailDetailed: (...args: unknown[]) => state.send(...args),
}))
vi.mock('@/lib/supabase/admin', () => {
  type Filter = (row: Row) => boolean

  class Query {
    private operation: 'select' | 'insert' | 'update' = 'select'
    private filters: Filter[] = []
    private payload: Row = {}
    private limitCount = Number.POSITIVE_INFINITY
    private sort: { key: string; ascending: boolean } | null = null
    private selected = false

    select() {
      this.selected = true
      return this
    }
    insert(payload: Row | Row[]) {
      this.operation = 'insert'
      this.payload = Array.isArray(payload) ? payload[0] : payload
      return this
    }
    update(payload: Row) {
      this.operation = 'update'
      this.payload = payload
      return this
    }
    eq(key: string, value: unknown) {
      this.filters.push((row) => row[key] === value)
      return this
    }
    neq(key: string, value: unknown) {
      this.filters.push((row) => row[key] !== value)
      return this
    }
    in(key: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[key]))
      return this
    }
    gte(key: string, value: string) {
      this.filters.push((row) => typeof row[key] === 'string' && String(row[key]) >= value)
      return this
    }
    order(key: string, options: { ascending: boolean }) {
      this.sort = { key, ascending: options.ascending }
      return this
    }
    limit(value: number) {
      this.limitCount = value
      return this
    }
    maybeSingle() {
      return this.run(true)
    }
    private run(single = false) {
      if (this.operation === 'insert') {
        if (state.insertError) return Promise.resolve({ data: null, error: state.insertError })
        const row: Row = {
          id: `notification-${++state.sequence}`,
          created_at: new Date().toISOString(),
          status: 'queued',
          ...this.payload,
        }
        if (state.rows.some((existing) => existing.dedupe_key === row.dedupe_key)) {
          return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } })
        }
        state.rows.push(row)
        return Promise.resolve({ data: this.selected ? [row] : null, error: null })
      }

      const matching = state.rows.filter((row) => this.filters.every((filter) => filter(row)))
      if (this.operation === 'update') matching.forEach((row) => Object.assign(row, this.payload))
      if (this.sort) {
        const { key, ascending } = this.sort
        matching.sort((left, right) => {
          const order = String(left[key] ?? '').localeCompare(String(right[key] ?? ''))
          return ascending ? order : -order
        })
      }
      const result = matching.slice(0, this.limitCount)
      return Promise.resolve({ data: single ? result[0] ?? null : result, error: null })
    }
    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return this.run().then(resolve, reject)
    }
  }

  return {
    createAdminClient: () => ({ from: () => new Query() }),
  }
})

import { processReferralEmails, queueReferralPayoutNotification } from './email-outbox'

const PARTNER_ID = '22222222-2222-4222-8222-222222222222'
const REQUEST_ID = '44444444-4444-4444-8444-444444444444'

beforeEach(() => {
  state.rows = []
  state.afterCallbacks = []
  state.insertError = null
  state.sequence = 0
  state.send.mockReset().mockResolvedValue({ ok: true })
  vi.stubEnv('REFERRAL_ENABLED', '1')
  vi.stubEnv('REFERRAL_PAYOUTS_ENABLED', '1')
  vi.stubEnv('ADMIN_NOTIFICATION_EMAIL', 'finance@gloval.test,secondary@gloval.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('referral payout email outbox', () => {
  it('queues a deduped admin cash request notice and sends it to the configured admin address', async () => {
    await queueReferralPayoutNotification({
      type: 'referral_cash_admin',
      partnerId: PARTNER_ID,
      payoutRequestId: REQUEST_ID,
      lang: 'tr',
      amountCents: 120_000,
    })

    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]).toMatchObject({
      type: 'referral_cash_admin',
      dedupe_key: `referral_cash_admin:${REQUEST_ID}`,
      status: 'queued',
    })
    expect(state.afterCallbacks).toHaveLength(1)

    const result = await processReferralEmails({ deadlineMs: Date.now() + 10_000 })
    expect(result).toMatchObject({ scanned: 1, sent: 1, retry: 0 })
    expect(state.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'finance@gloval.test',
      idempotencyKey: expect.stringMatching(/^referral-notice:/u),
    }))
    expect(state.send.mock.calls[0][0]).toMatchObject({
      subject: 'Yeni nakit ödeme talebi',
    })
    expect(state.rows[0].status).toBe('sent')
  })

  it('keeps payout creation successful when queue insertion fails', async () => {
    state.insertError = { code: 'XX000', message: 'outbox unavailable' }

    await expect(queueReferralPayoutNotification({
      type: 'referral_cash_requested',
      partnerId: PARTNER_ID,
      payoutRequestId: REQUEST_ID,
      lang: 'tr',
      amountCents: 100_000,
    })).resolves.toBeUndefined()
  })
})
