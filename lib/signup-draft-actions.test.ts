import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  limit: null as 'ip' | 'email' | null,
  checkError: null as unknown,
  insertError: null as unknown,
  inserted: [] as unknown[],
  ip: '203.0.113.9' as string | null,
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers(state.ip ? { 'x-forwarded-for': `${state.ip}, 10.0.0.1` } : {}),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/projects', () => ({ createProject: vi.fn() }))
vi.mock('@/lib/signup-draft-store', () => ({
  checkDraftLimits: vi.fn(async () => {
    if (state.checkError) throw state.checkError
    return state.limit
  }),
  createDraft: vi.fn(async (_admin: unknown, input: unknown) => {
    if (state.insertError) throw state.insertError
    state.inserted.push(input)
    return 'T'.repeat(43)
  }),
  claimDraft: vi.fn(),
  completeDraft: vi.fn(),
  releaseDraft: vi.fn(),
}))

import { createSignupDraft } from '@/lib/signup-draft-actions'

const draft = { name: 'Cafe', schema: { sections: [] }, publishIntent: true }

describe('createSignupDraft', () => {
  beforeEach(() => {
    state.limit = null
    state.checkError = null
    state.insertError = null
    state.inserted = []
    state.ip = '203.0.113.9'
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('stores the draft with a hashed client IP', async () => {
    const result = await createSignupDraft({ email: 'a@gmail.com', draft })
    expect(result).toEqual({ ok: true, token: 'T'.repeat(43) })
    const stored = state.inserted[0] as { ipHash: string }
    expect(stored.ipHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(stored)).not.toContain('203.0.113.9')
  })

  it('refuses without inserting when a limit is hit', async () => {
    state.limit = 'email'
    expect(await createSignupDraft({ email: 'a@gmail.com', draft })).toEqual({ ok: false, reason: 'limited' })
    expect(state.inserted).toHaveLength(0)
  })

  it('refuses oversized bodies before touching the database', async () => {
    const big = { ...draft, schema: { blob: 'a'.repeat(250_000) } }
    expect(await createSignupDraft({ email: 'a@gmail.com', draft: big })).toEqual({ ok: false, reason: 'invalid' })
    expect(state.inserted).toHaveLength(0)
  })

  it('reports storage_unavailable and logs the migration hint when the table is missing', async () => {
    state.checkError = { code: '42P01', message: 'relation "public.signup_drafts" does not exist' }
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await createSignupDraft({ email: 'a@gmail.com', draft })).toEqual({
      ok: false,
      reason: 'storage_unavailable',
    })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('074-signup-drafts.sql'), expect.stringContaining('does not exist'))
  })

  it('reports storage_unavailable for any other insert failure', async () => {
    state.insertError = new Error('boom')
    expect(await createSignupDraft({ email: 'a@gmail.com', draft })).toEqual({
      ok: false,
      reason: 'storage_unavailable',
    })
  })
})
