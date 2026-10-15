import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { RATE_LIMIT_SWEEP_MAX_ROWS, sweepExpiredRateLimitCounters } from './rate-limit-sweep'

const NOW = Date.parse('2026-10-15T03:00:00.000Z')
const HOUR = 60 * 60 * 1000

interface Row {
  subject: string
  window_started_at: string
}

/** Minimal in-memory stand-in for the select/delete query chains the sweep uses. */
function fakeAdmin(rows: Row[]) {
  const calls = { selectLimits: [] as number[] }
  const admin = {
    from() {
      let cutoff = ''
      let limit = Infinity
      let subjects: string[] | null = null
      let mode: 'select' | 'delete' = 'select'
      const chain = {
        select() {
          return chain
        },
        delete() {
          mode = 'delete'
          return chain
        },
        lt(_col: string, value: string) {
          cutoff = value
          return chain
        },
        in(_col: string, values: string[]) {
          subjects = values
          return chain
        },
        limit(n: number) {
          limit = n
          calls.selectLimits.push(n)
          return chain
        },
        then(resolve: (value: { data: { subject: string }[]; error: null }) => unknown) {
          const matching = rows.filter(
            (row) =>
              row.window_started_at < cutoff && (subjects === null || subjects.includes(row.subject)),
          )
          if (mode === 'delete') {
            for (const row of matching) rows.splice(rows.indexOf(row), 1)
            return resolve({ data: matching.map((r) => ({ subject: r.subject })), error: null })
          }
          return resolve({
            data: matching.slice(0, limit).map((r) => ({ subject: r.subject })),
            error: null,
          })
        },
      }
      return chain
    },
  }
  return { admin: admin as unknown as SupabaseClient, calls }
}

const stale = (i: number): Row => ({
  subject: `stt:day:anon:${i}`,
  window_started_at: new Date(NOW - 30 * HOUR).toISOString(),
})

describe('sweepExpiredRateLimitCounters', () => {
  it('deletes only rows whose window ended more than 25h ago', async () => {
    const rows: Row[] = [
      stale(1),
      { subject: 'stt:day:user:fresh', window_started_at: new Date(NOW - 23 * HOUR).toISOString() },
      { subject: 'stt:min:user:fresh', window_started_at: new Date(NOW - 1000).toISOString() },
    ]
    const { admin } = fakeAdmin(rows)
    expect(await sweepExpiredRateLimitCounters(admin, NOW)).toBe(1)
    expect(rows.map((r) => r.subject)).toEqual(['stt:day:user:fresh', 'stt:min:user:fresh'])
  })

  it('removes at most 5000 rows per run', async () => {
    const rows = Array.from({ length: 6200 }, (_, i) => stale(i))
    const { admin } = fakeAdmin(rows)
    expect(await sweepExpiredRateLimitCounters(admin, NOW)).toBe(RATE_LIMIT_SWEEP_MAX_ROWS)
    expect(rows).toHaveLength(1200)
  })

  it('cannot be asked to exceed the 5000-row cap', async () => {
    const rows = Array.from({ length: 5200 }, (_, i) => stale(i))
    const { admin } = fakeAdmin(rows)
    expect(await sweepExpiredRateLimitCounters(admin, NOW, { maxRows: 999_999 })).toBe(5000)
  })

  it('stops immediately when the time budget is already spent', async () => {
    const rows = [stale(1), stale(2)]
    const { admin } = fakeAdmin(rows)
    expect(await sweepExpiredRateLimitCounters(admin, NOW, { deadlineMs: Date.now() - 1 })).toBe(0)
    expect(rows).toHaveLength(2)
  })

  it('returns 0 on an empty table', async () => {
    const { admin } = fakeAdmin([])
    expect(await sweepExpiredRateLimitCounters(admin, NOW)).toBe(0)
  })
})
