import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  admin: true,
  clientCreated: 0,
  queries: [] as Array<{ table: string; columns: string; options: unknown; since?: string; heardFrom?: string }>,
  total: 0,
  perValue: {} as Record<string, number>,
  error: null as null | { message: string },
}))

vi.mock('@/lib/mail/admin-guard', () => ({
  getAdminUser: vi.fn(async () => (state.admin ? { userId: 'admin-id', email: 'admin@gloval.ai' } : null)),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    state.clientCreated++
    return {
      from: (table: string) => {
        const record = { table, columns: '', options: undefined as unknown, since: undefined, heardFrom: undefined } as {
          table: string
          columns: string
          options: unknown
          since?: string
          heardFrom?: string
        }
        state.queries.push(record)
        const chain = {
          select: (columns: string, options: unknown) => {
            record.columns = columns
            record.options = options
            return chain
          },
          gte: (_column: string, value: string) => {
            record.since = value
            return chain
          },
          eq: (_column: string, value: string) => {
            record.heardFrom = value
            return chain
          },
          then: (resolve: (value: unknown) => unknown) =>
            resolve({
              count: record.heardFrom ? (state.perValue[record.heardFrom] ?? 0) : state.total,
              error: state.error,
            }),
        }
        return chain
      },
    }
  },
}))

import { buildHeardFromSummary, getHeardFromSummary, HEARD_FROM_SUMMARY_DAYS } from './heard-from-summary'

beforeEach(() => {
  state.admin = true
  state.clientCreated = 0
  state.queries = []
  state.total = 0
  state.perValue = {}
  state.error = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getHeardFromSummary', () => {
  it('reads nothing for non-admins', async () => {
    state.admin = false
    state.total = 10
    state.perValue = { instagram: 5 }
    await expect(getHeardFromSummary()).resolves.toBeNull()
    expect(state.clientCreated).toBe(0)
    expect(state.queries).toHaveLength(0)
  })

  it('counts each option, the unanswered rest, and the response rate', async () => {
    state.total = 20
    state.perValue = { instagram: 6, facebook: 2, google: 4, friend: 1, press: 0, other: 1 }
    const summary = await getHeardFromSummary()
    expect(summary).toEqual({
      windowDays: 30,
      totalSignups: 20,
      answered: 14,
      unanswered: 6,
      responseRatePct: 70,
      counts: { instagram: 6, facebook: 2, google: 4, friend: 1, press: 0, other: 1 },
    })
  })

  it('limits every query to the last 30 days and fetches counts only, never rows', async () => {
    const now = Date.parse('2026-06-30T12:00:00.000Z')
    await getHeardFromSummary(now)
    expect(state.queries).toHaveLength(7)
    for (const q of state.queries) {
      expect(q.table).toBe('profiles')
      expect(q.columns).toBe('id')
      expect(q.options).toEqual({ count: 'exact', head: true })
      expect(q.since).toBe(new Date(now - HEARD_FROM_SUMMARY_DAYS * 86_400_000).toISOString())
    }
  })

  it('returns an empty summary when nobody has answered', async () => {
    state.total = 5
    const summary = await getHeardFromSummary()
    expect(summary?.answered).toBe(0)
    expect(summary?.unanswered).toBe(5)
    expect(summary?.responseRatePct).toBe(0)
  })

  it('does not break the overview when the query fails', async () => {
    state.error = { message: 'column profiles.heard_from does not exist' }
    await expect(getHeardFromSummary()).resolves.toBeNull()
  })

  it('exposes aggregate numbers only (no personal fields)', async () => {
    state.total = 3
    state.perValue = { google: 1 }
    const summary = await getHeardFromSummary()
    expect(Object.keys(summary!).sort()).toEqual(
      ['answered', 'counts', 'responseRatePct', 'totalSignups', 'unanswered', 'windowDays'].sort(),
    )
    const json = JSON.stringify(summary)
    expect(json).not.toMatch(/email|full_name|user_id|@/i)
    expect(Object.values(summary!.counts).every((n) => typeof n === 'number')).toBe(true)
  })
})

describe('buildHeardFromSummary', () => {
  it('handles zero signups without dividing by zero', () => {
    expect(buildHeardFromSummary({ total: 0, counts: {} }).responseRatePct).toBe(0)
  })

  it('never reports fewer signups than answers', () => {
    const summary = buildHeardFromSummary({ total: 1, counts: { google: 3 } })
    expect(summary.totalSignups).toBe(3)
    expect(summary.unanswered).toBe(0)
  })

  it('rounds the rate to one decimal', () => {
    expect(buildHeardFromSummary({ total: 3, counts: { google: 1 } }).responseRatePct).toBe(33.3)
  })
})
