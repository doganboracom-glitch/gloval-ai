import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_ACTIVE_DRAFTS_PER_EMAIL,
  MAX_DRAFTS_PER_IP_PER_HOUR,
  MAX_DRAFT_BYTES,
  hashDraftIp,
  isMissingTableError,
  parseDraftPayload,
} from '@/lib/signup-draft-core'
import { checkDraftLimits, createDraft, sweepSignupDrafts } from '@/lib/signup-draft-store'

type Row = Record<string, unknown>

/** Minimal PostgREST stand-in: counting selects, filtered deletes with `or`, optional table error. */
function fakeAdmin(opts: { error?: { code: string; message: string } } = {}) {
  const rows: Row[] = []
  const from = () => {
    const filters: Array<(r: Row) => boolean> = []
    let mode: 'select' | 'delete' = 'select'
    let head = false
    const run = () => rows.filter((r) => filters.every((f) => f(r)))
    const result = () => {
      if (opts.error) return { data: null, count: null, error: opts.error }
      if (mode === 'delete') {
        const hit = run()
        hit.forEach((r) => rows.splice(rows.indexOf(r), 1))
        return { data: hit, count: null, error: null }
      }
      return { data: head ? null : run(), count: run().length, error: null }
    }
    const b: Record<string, unknown> = {
      insert: (row: Row) => {
        if (opts.error) return Promise.resolve({ error: opts.error })
        rows.push({ id: `id-${rows.length}`, consumed_at: null, ...row })
        return Promise.resolve({ error: null })
      },
      select: (_cols?: string, o?: { head?: boolean }) => {
        head = o?.head === true
        return b
      },
      delete: () => {
        mode = 'delete'
        return b
      },
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      is: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      gt: (k: string, v: string) => (filters.push((r) => String(r[k]) > v), b),
      or: (expr: string) => {
        const parts = expr.split(',').map((p) => p.split('.'))
        filters.push((r) =>
          parts.some(([col, op, val]) => {
            const cell = r[col]
            if (cell == null) return false
            return op === 'lt' && String(cell) < val
          }),
        )
        return b
      },
      then: (resolve: (v: unknown) => void) => resolve(result()),
    }
    return b
  }
  return { admin: { from } as never, rows }
}

const payload = parseDraftPayload({ name: 'Cafe', schema: { sections: [] } })!
const NOW = Date.UTC(2026, 0, 10, 12)

describe('draft body size', () => {
  it('caps the draft at 200 KB measured in bytes', () => {
    expect(MAX_DRAFT_BYTES).toBe(200_000)
    expect(parseDraftPayload({ name: 'x', schema: { blob: 'a'.repeat(150_000) } })).not.toBeNull()
    expect(parseDraftPayload({ name: 'x', schema: { blob: 'a'.repeat(210_000) } })).toBeNull()
    // 3 bytes per character: 80k characters is ~240 KB on the wire although < 200k characters.
    expect(parseDraftPayload({ name: 'x', schema: { blob: 'ş€'.repeat(40_000) } })).toBeNull()
  })
})

describe('per-email and per-IP limits', () => {
  it('rejects the 4th active draft for the same e-mail but not other e-mails', async () => {
    const { admin } = fakeAdmin()
    for (let i = 0; i < MAX_ACTIVE_DRAFTS_PER_EMAIL; i++) {
      expect(await checkDraftLimits(admin, { email: 'A@b.com', ipHash: null, now: NOW })).toBeNull()
      await createDraft(admin, { email: 'a@b.com', payload, now: NOW })
    }
    expect(await checkDraftLimits(admin, { email: ' a@B.com ', ipHash: null, now: NOW })).toBe('email')
    expect(await checkDraftLimits(admin, { email: 'other@b.com', ipHash: null, now: NOW })).toBeNull()
  })

  it('does not count consumed or expired drafts as active', async () => {
    const { admin, rows } = fakeAdmin()
    for (let i = 0; i < 3; i++) await createDraft(admin, { email: 'a@b.com', payload, now: NOW })
    rows[0].consumed_at = new Date(NOW).toISOString()
    expect(await checkDraftLimits(admin, { email: 'a@b.com', ipHash: null, now: NOW })).toBeNull()
    expect(
      await checkDraftLimits(admin, { email: 'a@b.com', ipHash: null, now: NOW + 8 * 86_400_000 }),
    ).toBeNull()
  })

  it('rejects the 11th draft from one IP within an hour, then allows it after the window', async () => {
    const { admin, rows } = fakeAdmin()
    const ipHash = hashDraftIp('203.0.113.9')
    for (let i = 0; i < MAX_DRAFTS_PER_IP_PER_HOUR; i++) {
      expect(await checkDraftLimits(admin, { email: `u${i}@b.com`, ipHash, now: NOW })).toBeNull()
      await createDraft(admin, { email: `u${i}@b.com`, payload, ipHash, now: NOW })
      rows[i].created_at = new Date(NOW).toISOString()
    }
    expect(await checkDraftLimits(admin, { email: 'new@b.com', ipHash, now: NOW })).toBe('ip')
    expect(
      await checkDraftLimits(admin, { email: 'new@b.com', ipHash: hashDraftIp('198.51.100.1'), now: NOW }),
    ).toBeNull()
    expect(await checkDraftLimits(admin, { email: 'new@b.com', ipHash, now: NOW + 61 * 60_000 })).toBeNull()
  })

  it('skips the IP limit when the IP is unknown and never stores the raw IP', async () => {
    const { admin, rows } = fakeAdmin()
    expect(await checkDraftLimits(admin, { email: 'a@b.com', ipHash: null, now: NOW })).toBeNull()
    await createDraft(admin, { email: 'a@b.com', payload, ipHash: hashDraftIp('203.0.113.9'), now: NOW })
    expect(JSON.stringify(rows[0])).not.toContain('203.0.113.9')
  })
})

describe('expired / consumed draft cleanup', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('deletes expired drafts and drafts consumed over a day ago, and logs the count', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { admin, rows } = fakeAdmin()
    const day = 86_400_000
    rows.push(
      { id: 'expired', expires_at: new Date(NOW - 1).toISOString(), consumed_at: null },
      { id: 'consumed-old', expires_at: new Date(NOW + day).toISOString(), consumed_at: new Date(NOW - 2 * day).toISOString() },
      { id: 'consumed-recent', expires_at: new Date(NOW + day).toISOString(), consumed_at: new Date(NOW - 1000).toISOString() },
      { id: 'active', expires_at: new Date(NOW + day).toISOString(), consumed_at: null },
    )
    expect(await sweepSignupDrafts(admin, NOW)).toBe(2)
    expect(rows.map((r) => r.id)).toEqual(['consumed-recent', 'active'])
    expect(log).toHaveBeenCalledWith(expect.stringContaining('deleted 2'))
  })

  it('throws on a missing table so the cron block records the failure', async () => {
    const { admin } = fakeAdmin({ error: { code: '42P01', message: 'relation "signup_drafts" does not exist' } })
    await expect(sweepSignupDrafts(admin, NOW)).rejects.toMatchObject({ code: '42P01' })
  })
})

describe('missing table detection', () => {
  it('recognises Postgres and PostgREST codes only', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true)
    expect(isMissingTableError({ code: 'PGRST205' })).toBe(true)
    expect(isMissingTableError({ code: '23505' })).toBe(false)
    expect(isMissingTableError(null)).toBe(false)
  })
})
