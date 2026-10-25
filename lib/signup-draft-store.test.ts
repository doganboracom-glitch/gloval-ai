import { describe, expect, it } from 'vitest'
import {
  DRAFT_EMAIL_ACTIVE_LIMIT,
  DRAFT_GLOBAL_ACTIVE_LIMIT,
  DRAFT_IP_LIMIT,
  MAX_DRAFT_BYTES,
  hashClaimToken,
  isSignupIdeaDraftPayload,
  isValidClaimToken,
  newClaimToken,
  parseDraftPayload,
} from '@/lib/signup-draft-core'
import { MAX_SIGNUP_IDEA_CHARS } from '@/lib/signup-draft-shared'
import {
  DraftStoreError,
  claimDraft,
  completeDraft,
  completeIdeaDraft,
  createDraft,
  releaseDraft,
  reserveDraftIpSlot,
} from '@/lib/signup-draft-store'
import { sweepSignupDrafts } from '@/lib/signup-draft-sweep'

type Row = Record<string, unknown>

function fakeAdmin(options: { failCode?: string } = {}) {
  const rows: Row[] = []
  const ipCounts = new Map<string, number>()
  const failure = options.failCode ? { code: options.failCode, message: 'boom' } : null

  const from = () => {
    let mode: 'select' | 'update' | 'insert' | 'delete' = 'select'
    let patch: Row = {}
    let head = false
    let max = Infinity
    const filters: Array<(r: Row) => boolean> = []
    const run = () => rows.filter((r) => filters.every((f) => f(r)))
    const b: Record<string, unknown> = {
      insert: (row: Row) => {
        if (failure) return Promise.resolve({ error: failure })
        rows.push({
          id: `id-${rows.length}`,
          consumed_at: null,
          claimed_by: null,
          project_id: null,
          created_at: new Date().toISOString(),
          ...row,
        })
        return Promise.resolve({ error: null })
      },
      update: (p: Row) => {
        mode = 'update'
        patch = p
        return b
      },
      delete: () => {
        mode = 'delete'
        return b
      },
      select: (_cols?: string, opts?: { head?: boolean }) => {
        if (mode === 'select') head = opts?.head === true
        return b
      },
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      is: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      gt: (k: string, v: string) => (filters.push((r) => r[k] != null && String(r[k]) > v), b),
      in: (k: string, values: unknown[]) => (filters.push((r) => values.includes(r[k])), b),
      or: (expr: string) => {
        const parts = expr.split(',').map((p) => /^([a-z_]+)\.lt\.(.+)$/.exec(p)!)
        filters.push((r) => parts.some(([, col, val]) => r[col] != null && String(r[col]) < val))
        return b
      },
      limit: (n: number) => ((max = n), b),
      maybeSingle: () => {
        const hit = run()[0]
        if (hit && mode === 'update') Object.assign(hit, patch)
        return Promise.resolve({ data: hit ?? null })
      },
      then: (resolve: (v: unknown) => void) => {
        if (failure) return resolve({ data: null, count: null, error: failure })
        const hits = run().slice(0, max)
        if (mode === 'update') hits.forEach((r) => Object.assign(r, patch))
        if (mode === 'delete') hits.forEach((r) => rows.splice(rows.indexOf(r), 1))
        if (mode === 'select' && head) return resolve({ count: hits.length, error: null })
        return resolve({ data: hits, error: null })
      },
    }
    return b
  }

  const rpc = (_name: string, args: { p_subject: string; p_limit: number }) => ({
    maybeSingle: () => {
      const next = (ipCounts.get(args.p_subject) ?? 0) + 1
      ipCounts.set(args.p_subject, next)
      return Promise.resolve({ data: { allowed: next <= args.p_limit }, error: null })
    },
  })

  return { admin: { from, rpc } as never, rows }
}

const payload = parseDraftPayload({ name: 'Cafe', schema: { sections: [] }, publishIntent: true })!

describe('claim token helpers', () => {
  it('generates valid, unique tokens and hashes them', () => {
    const a = newClaimToken()
    expect(isValidClaimToken(a)).toBe(true)
    expect(a).not.toBe(newClaimToken())
    expect(hashClaimToken(a)).toMatch(/^[0-9a-f]{64}$/)
    expect(isValidClaimToken('short')).toBe(false)
  })
})

describe('idea-only draft payload', () => {
  it('trims the idea and enforces the 2,000-character cap', () => {
    expect(MAX_SIGNUP_IDEA_CHARS).toBe(2000)
    const idea = parseDraftPayload({ kind: 'idea', prompt: `  ${'x'.repeat(2000)}  ` })
    expect(idea).toEqual({ kind: 'idea', prompt: 'x'.repeat(2000) })
    expect(isSignupIdeaDraftPayload(idea)).toBe(true)
    expect(parseDraftPayload({ kind: 'idea', prompt: 'x'.repeat(2001) })).toBeNull()
    expect(parseDraftPayload({ kind: 'idea', prompt: '   ' })).toBeNull()
  })
})

describe('draft body size cap', () => {
  it('rejects malformed payloads', () => {
    expect(parseDraftPayload(null)).toBeNull()
    expect(parseDraftPayload({ name: 'x' })).toBeNull()
  })

  it('caps the serialized payload at 200 KB', () => {
    expect(MAX_DRAFT_BYTES).toBe(200_000)
    expect(parseDraftPayload({ name: 'x', schema: { blob: 'a'.repeat(150_000) } })).not.toBeNull()
    expect(parseDraftPayload({ name: 'x', schema: { blob: 'a'.repeat(200_000) } })).toBeNull()
  })

  it('counts bytes, not characters', () => {
    // 70k three-byte characters (euro sign) = 210 KB of UTF-8 in only 70k characters.
    expect(parseDraftPayload({ name: 'x', schema: { blob: '\u20ac'.repeat(70_000) } })).toBeNull()
    expect(parseDraftPayload({ name: 'x', schema: { blob: '\u20ac'.repeat(60_000) } })).not.toBeNull()
  })
})

describe('abuse limits', () => {
  it('allows 10 drafts per IP hash per window, then refuses', async () => {
    const { admin } = fakeAdmin()
    for (let i = 0; i < DRAFT_IP_LIMIT; i++) {
      expect(await reserveDraftIpSlot(admin, 'iphash')).toBe(true)
    }
    expect(await reserveDraftIpSlot(admin, 'iphash')).toBe(false)
    expect(await reserveDraftIpSlot(admin, 'other')).toBe(true)
  })

  it('refuses a 4th active draft for the same e-mail (case-insensitive)', async () => {
    const { admin } = fakeAdmin()
    for (let i = 0; i < DRAFT_EMAIL_ACTIVE_LIMIT; i++) {
      await createDraft(admin, { email: 'a@b.com', payload })
    }
    await expect(createDraft(admin, { email: ' A@B.com ', payload })).rejects.toMatchObject({
      reason: 'email_limit',
    })
    await expect(createDraft(admin, { email: 'other@b.com', payload })).resolves.toBeTruthy()
  })

  it('does not count used or expired drafts against the e-mail limit', async () => {
    const { admin, rows } = fakeAdmin()
    for (let i = 0; i < DRAFT_EMAIL_ACTIVE_LIMIT; i++) {
      await createDraft(admin, { email: 'a@b.com', payload })
    }
    rows[0].consumed_at = new Date().toISOString()
    rows[1].expires_at = new Date(0).toISOString()
    await expect(createDraft(admin, { email: 'a@b.com', payload })).resolves.toBeTruthy()
  })

  it('stops accepting drafts when the table is at global capacity', async () => {
    const { admin, rows } = fakeAdmin()
    for (let i = 0; i < DRAFT_GLOBAL_ACTIVE_LIMIT; i++) {
      rows.push({
        id: `x${i}`,
        email: `u${i}@b.com`,
        consumed_at: null,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
    }
    await expect(createDraft(admin, { email: 'new@b.com', payload })).rejects.toMatchObject({
      reason: 'capacity',
    })
  })
})

describe('storage failures are explicit', () => {
  it('reports a missing table instead of silently succeeding', async () => {
    const { admin } = fakeAdmin({ failCode: '42P01' })
    const error = await createDraft(admin, { email: 'a@b.com', payload }).catch((e) => e)
    expect(error).toBeInstanceOf(DraftStoreError)
    expect(error).toMatchObject({ reason: 'table_missing', code: '42P01' })
  })

  it('maps the PostgREST schema-cache miss to table_missing and others to storage', async () => {
    const cache = await createDraft(fakeAdmin({ failCode: 'PGRST205' }).admin, { email: 'a@b.com', payload }).catch(
      (e) => e,
    )
    expect(cache.reason).toBe('table_missing')
    const other = await createDraft(fakeAdmin({ failCode: '57014' }).admin, { email: 'a@b.com', payload }).catch(
      (e) => e,
    )
    expect(other.reason).toBe('storage')
  })

  it('never puts the e-mail or content into the error', async () => {
    const { admin } = fakeAdmin({ failCode: '42P01' })
    const error = await createDraft(admin, { email: 'secret@b.com', payload }).catch((e) => e)
    expect(JSON.stringify([error.message, error.reason, error.code])).not.toContain('secret@b.com')
  })
})

describe('signup draft claim', () => {
  it('stores only the token hash, never the token', async () => {
    const { admin, rows } = fakeAdmin()
    const token = await createDraft(admin, { email: ' A@B.com ', payload })
    expect(rows[0].token_hash).toBe(hashClaimToken(token))
    expect(JSON.stringify(rows[0])).not.toContain(token)
    expect(rows[0].email).toBe('a@b.com')
  })

  it('lets the matching user claim once, then reports done for the same user', async () => {
    const { admin, rows } = fakeAdmin()
    const token = await createDraft(admin, { email: 'a@b.com', payload })
    const first = await claimDraft(admin, { token, userId: 'u1', email: 'A@b.com' })
    expect(first.status).toBe('claimed')
    if (first.status !== 'claimed') return

    expect((await claimDraft(admin, { token, userId: 'u1', email: 'a@b.com' })).status).toBe('busy')
    await completeDraft(admin, first.id, 'p1', true)
    expect(rows[0].email).toBe('')
    expect(rows[0].payload).toEqual({ publishIntent: true, editIntent: false })
    expect(await claimDraft(admin, { token, userId: 'u1', email: 'a@b.com' })).toEqual({
      status: 'done',
      projectId: 'p1',
      publishIntent: true,
      editIntent: false,
    })
  })

  it('restores an idea only for its claimant without creating a project', async () => {
    const { admin, rows } = fakeAdmin()
    const idea = parseDraftPayload({ kind: 'idea', prompt: 'Bir kahve sitesi kur' })
    if (!isSignupIdeaDraftPayload(idea)) throw new Error('expected idea payload')
    const token = await createDraft(admin, { email: 'a@b.com', payload: idea })
    const first = await claimDraft(admin, { token, userId: 'u1', email: 'a@b.com' })
    if (first.status !== 'claimed' || !isSignupIdeaDraftPayload(first.payload)) {
      throw new Error('expected claimed idea')
    }

    await completeIdeaDraft(admin, first.id, first.payload)
    expect(rows[0].email).toBe('')
    expect(rows[0].payload).toEqual({ kind: 'idea', prompt: 'Bir kahve sitesi kur' })
    expect(await claimDraft(admin, { token, userId: 'u1', email: 'a@b.com' })).toEqual({
      status: 'done_idea',
      prompt: 'Bir kahve sitesi kur',
    })
    expect((await claimDraft(admin, { token, userId: 'u2', email: 'a@b.com' })).status).toBe('invalid')
  })

  it('never reveals a draft to a different user or e-mail', async () => {
    const { admin } = fakeAdmin()
    const token = await createDraft(admin, { email: 'a@b.com', payload })
    expect((await claimDraft(admin, { token, userId: 'u2', email: 'x@y.com' })).status).toBe('invalid')
    const first = await claimDraft(admin, { token, userId: 'u1', email: 'a@b.com' })
    expect(first.status).toBe('claimed')
    expect((await claimDraft(admin, { token, userId: 'u2', email: 'a@b.com' })).status).toBe('invalid')
  })

  it('rejects expired drafts and allows retry after release', async () => {
    const { admin } = fakeAdmin()
    const token = await createDraft(admin, { email: 'a@b.com', payload, now: 0 })
    expect((await claimDraft(admin, { token, userId: 'u1', email: 'a@b.com', now: 8 * 86_400_000 })).status).toBe(
      'invalid',
    )
    const token2 = await createDraft(admin, { email: 'a@b.com', payload })
    const c = await claimDraft(admin, { token: token2, userId: 'u1', email: 'a@b.com' })
    if (c.status !== 'claimed') throw new Error('expected claim')
    await releaseDraft(admin, c.id)
    expect((await claimDraft(admin, { token: token2, userId: 'u1', email: 'a@b.com' })).status).toBe('claimed')
  })
})

describe('draft cleanup sweep', () => {
  const NOW = Date.UTC(2026, 5, 10, 12, 0, 0)
  const iso = (ms: number) => new Date(ms).toISOString()
  const base = (id: string, over: Row): Row => ({
    id,
    email: 'a@b.com',
    consumed_at: null,
    created_at: iso(NOW - 86_400_000),
    expires_at: iso(NOW + 6 * 86_400_000),
    ...over,
  })

  it('deletes expired and used drafts, keeps fresh and just-used ones, and returns the count', async () => {
    const { admin, rows } = fakeAdmin()
    rows.push(
      base('fresh', {}),
      base('expired', { expires_at: iso(NOW - 1000) }),
      base('old', { created_at: iso(NOW - 8 * 86_400_000) }),
      base('used-long-ago', { consumed_at: iso(NOW - 2 * 3_600_000) }),
      base('used-just-now', { consumed_at: iso(NOW - 60_000) }),
    )
    const deleted = await sweepSignupDrafts(admin, NOW)
    expect(deleted).toBe(3)
    expect(rows.map((r) => r.id).sort()).toEqual(['fresh', 'used-just-now'])
  })

  it('returns 0 on an empty table and surfaces storage errors', async () => {
    expect(await sweepSignupDrafts(fakeAdmin().admin, NOW)).toBe(0)
    await expect(sweepSignupDrafts(fakeAdmin({ failCode: '42P01' }).admin, NOW)).rejects.toMatchObject({
      code: '42P01',
    })
  })

  it('stops at the row cap', async () => {
    const { admin, rows } = fakeAdmin()
    for (let i = 0; i < 10; i++) rows.push(base(`e${i}`, { expires_at: iso(NOW - 1000) }))
    expect(await sweepSignupDrafts(admin, NOW, { maxRows: 4 })).toBe(4)
    expect(rows).toHaveLength(6)
  })
})
