import { describe, expect, it } from 'vitest'
import {
  hashClaimToken,
  isValidClaimToken,
  newClaimToken,
  parseDraftPayload,
} from '@/lib/signup-draft-core'
import { claimDraft, completeDraft, createDraft, releaseDraft } from '@/lib/signup-draft-store'

type Row = Record<string, unknown>

function fakeAdmin() {
  const rows: Row[] = []
  const from = () => {
    let mode: 'select' | 'update' | 'insert' = 'select'
    let patch: Row = {}
    const filters: Array<(r: Row) => boolean> = []
    const run = () => rows.filter((r) => filters.every((f) => f(r)))
    const b: Record<string, unknown> = {
      insert: (row: Row) => {
        rows.push({ id: `id-${rows.length}`, consumed_at: null, claimed_by: null, project_id: null, ...row })
        return Promise.resolve({ error: null })
      },
      update: (p: Row) => {
        mode = 'update'
        patch = p
        return b
      },
      select: () => b,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      is: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      gt: (k: string, v: string) => (filters.push((r) => String(r[k]) > v), b),
      maybeSingle: () => {
        const hit = run()[0]
        if (hit && mode === 'update') Object.assign(hit, patch)
        return Promise.resolve({ data: hit ?? null })
      },
      then: (resolve: (v: unknown) => void) => {
        if (mode === 'update') run().forEach((r) => Object.assign(r, patch))
        resolve({ data: null })
      },
    }
    return b
  }
  return { admin: { from } as never, rows }
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

  it('rejects malformed or oversized payloads', () => {
    expect(parseDraftPayload(null)).toBeNull()
    expect(parseDraftPayload({ name: 'x' })).toBeNull()
    expect(parseDraftPayload({ name: 'x', schema: { blob: 'a'.repeat(700_000) } })).toBeNull()
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
    const { admin } = fakeAdmin()
    const token = await createDraft(admin, { email: 'a@b.com', payload })
    const first = await claimDraft(admin, { token, userId: 'u1', email: 'A@b.com' })
    expect(first.status).toBe('claimed')
    if (first.status !== 'claimed') return

    expect((await claimDraft(admin, { token, userId: 'u1', email: 'a@b.com' })).status).toBe('busy')
    await completeDraft(admin, first.id, 'p1')
    expect(await claimDraft(admin, { token, userId: 'u1', email: 'a@b.com' })).toEqual({
      status: 'done',
      projectId: 'p1',
      publishIntent: true,
    })
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
