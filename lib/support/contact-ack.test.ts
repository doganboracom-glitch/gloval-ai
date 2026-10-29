import { beforeEach, describe, expect, it, vi } from 'vitest'

type Call = { table: string; op: string; args: unknown[] }
const state = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  tickets: [] as Array<{ id: string }>,
  insertError: null as null | { code?: string; message: string },
}))

vi.mock('next/server', () => ({ after: (fn: () => void) => void fn }))
vi.mock('@/lib/notify', () => ({ SUPPORT_EMAIL: 'support@gloval.ai', sendTransactionalEmailDetailed: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {}
      const record = (op: string) => (...args: unknown[]) => {
        state.calls.push({ table, op, args } satisfies Call)
        return builder
      }
      for (const op of ['select', 'eq', 'ilike', 'gte', 'order', 'limit']) builder[op] = record(op)
      builder.insert = (...args: unknown[]) => {
        state.calls.push({ table, op: 'insert', args })
        return Promise.resolve({ error: state.insertError })
      }
      builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: state.tickets, error: null })
      return builder
    },
  }),
}))

import {
  CONTACT_ACK_LIMIT_PER_EMAIL,
  CONTACT_ACK_WINDOW_MS,
  contactAckDedupeKey,
  enqueueContactAck,
  isWithinAckBudget,
} from '@/lib/support/contact-ack'

const input = { ticketNumber: 'GLV-AAAAAA', email: 'Ali@Example.com', lang: 'tr' as const }

beforeEach(() => {
  state.calls = []
  state.tickets = []
  state.insertError = null
})

describe('acknowledgement abuse limits', () => {
  it('allows at most 3 acknowledgements per recipient per 24 hours', () => {
    expect(CONTACT_ACK_LIMIT_PER_EMAIL).toBe(3)
    expect(CONTACT_ACK_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('counts the recipient case-insensitively over the 24h window, oldest tickets first', async () => {
    const now = Date.UTC(2026, 9, 29, 12)
    state.tickets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    await isWithinAckBudget('c', 'Ali@Example.com', now)
    const ops = Object.fromEntries(state.calls.map((c) => [c.op, c.args]))
    expect(ops.ilike).toEqual(['contact_email', 'Ali@Example.com'])
    expect(ops.gte).toEqual(['created_at', new Date(now - CONTACT_ACK_WINDOW_MS).toISOString()])
    expect(ops.limit).toEqual([3])
  })

  it('accepts the first three tickets and rejects the fourth', async () => {
    state.tickets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(await isWithinAckBudget('a', 'x@y.co')).toBe(true)
    expect(await isWithinAckBudget('c', 'x@y.co')).toBe(true)
    expect(await isWithinAckBudget('d', 'x@y.co')).toBe(false)
  })

  it('does not queue anything for the fourth ticket within 24 hours', async () => {
    state.tickets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const result = await enqueueContactAck({ ticketId: 'd', ...input })
    expect(result).toBe('rate_limited')
    expect(state.calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('claims one acknowledgement per ticket through the dedupe key', async () => {
    state.tickets = [{ id: 'a' }]
    const first = await enqueueContactAck({ ticketId: 'a', ...input })
    const insert = state.calls.find((c) => c.op === 'insert')
    expect(first).toBe('queued')
    expect(insert?.args[0]).toMatchObject({ dedupe_key: contactAckDedupeKey('a'), status: 'queued' })

    state.insertError = { code: '23505', message: 'duplicate key' }
    expect(await enqueueContactAck({ ticketId: 'a', ...input })).toBe('duplicate')
  })
})
