import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HEARD_FROM_VALUES, isHeardFromValue, shouldAskHeardFrom } from '@/lib/heard-from'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const requestUser = vi.fn()
const updateChain = {
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
}
const fromMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: fromMock }),
}))
vi.mock('@/lib/supabase/request-user', () => ({
  getRequestUser: () => requestUser(),
  authUnavailableActionResult: () => ({ ok: false, reason: 'auth_unavailable' }),
}))

import { saveHeardFrom } from '@/lib/heard-from-actions'

function stubUpdate(result: { data: unknown; error: unknown }) {
  updateChain.update.mockReturnValue(updateChain)
  updateChain.eq.mockReturnValue(updateChain)
  updateChain.select.mockResolvedValue(result)
  fromMock.mockReturnValue(updateChain)
}

describe('heard_from values', () => {
  it('accepts only the six fixed values', () => {
    expect([...HEARD_FROM_VALUES]).toEqual(['instagram', 'facebook', 'google', 'friend', 'press', 'other'])
    for (const value of HEARD_FROM_VALUES) expect(isHeardFromValue(value)).toBe(true)
  })

  it('rejects free text, empty values and non-strings', () => {
    for (const value of ['', ' ', 'tiktok', 'Instagram', 'other; drop table profiles', null, undefined, 3, {}]) {
      expect(isHeardFromValue(value)).toBe(false)
    }
  })
})

describe('shouldAskHeardFrom', () => {
  const now = Date.parse('2026-03-10T12:00:00Z')

  it('asks only new, unanswered accounts', () => {
    expect(shouldAskHeardFrom({ heardFrom: null, createdAt: '2026-03-09T12:00:00Z', now })).toBe(true)
    expect(shouldAskHeardFrom({ heardFrom: 'google', createdAt: '2026-03-09T12:00:00Z', now })).toBe(false)
    expect(shouldAskHeardFrom({ heardFrom: null, createdAt: '2026-01-01T00:00:00Z', now })).toBe(false)
  })

  it('never asks when the creation date is missing or unreadable', () => {
    expect(shouldAskHeardFrom({ heardFrom: null, createdAt: null, now })).toBe(false)
    expect(shouldAskHeardFrom({ heardFrom: null, createdAt: 'not-a-date', now })).toBe(false)
  })
})

describe('saveHeardFrom', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestUser.mockResolvedValue({ kind: 'authenticated', user: { id: 'user-1' } })
  })

  it('saves a valid choice to the caller own profile row only', async () => {
    stubUpdate({ data: [{ id: 'user-1' }], error: null })
    await expect(saveHeardFrom('instagram')).resolves.toEqual({ ok: true })
    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(updateChain.update).toHaveBeenCalledWith({ heard_from: 'instagram' })
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('rejects an invalid value before touching the database', async () => {
    await expect(saveHeardFrom('tiktok')).resolves.toEqual({ ok: false, error: 'invalid_value' })
    await expect(saveHeardFrom('')).resolves.toEqual({ ok: false, error: 'invalid_value' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('refuses signed-out callers', async () => {
    requestUser.mockResolvedValue({ kind: 'unauthenticated' })
    await expect(saveHeardFrom('google')).resolves.toEqual({ ok: false, error: 'not_authenticated' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('reports failure when RLS or the database blocks the update', async () => {
    stubUpdate({ data: [], error: null })
    await expect(saveHeardFrom('press')).resolves.toEqual({ ok: false, error: 'update_failed' })
    stubUpdate({ data: null, error: { message: 'boom' } })
    await expect(saveHeardFrom('press')).resolves.toEqual({ ok: false, error: 'update_failed' })
  })
})

describe('132 migration (static checks, nothing is executed)', () => {
  const migration = read('scripts/132-profiles-heard-from.sql')
  const rollback = read('scripts/132-profiles-heard-from.rollback.sql')
  const forward = (migration.match(/-- START FORWARD MIGRATION([\s\S]*?)-- END FORWARD MIGRATION/)?.[1] ?? '')
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

  it('adds one nullable column constrained to the fixed values, with no new table or policy', () => {
    expect(forward).toContain('alter table public.profiles add column if not exists heard_from text;')
    expect(forward).not.toMatch(/heard_from text not null/)
    const check = forward.match(/check \(([^;]*)\);/)?.[1] ?? ''
    expect(check).toContain('heard_from is null or heard_from in')
    for (const value of HEARD_FROM_VALUES) expect(check).toContain(`'${value}'`)
    expect(forward).not.toMatch(/create table|create policy|alter policy|drop policy|create (or replace )?function|trigger/)
  })

  it('keeps the column private: no anon/public access, owner-only grants for authenticated', () => {
    expect(forward).toContain('revoke all privileges (heard_from) on table public.profiles from public, anon;')
    expect(forward).toContain('grant select (heard_from) on table public.profiles to authenticated;')
    expect(forward).toContain('grant update (heard_from) on table public.profiles to authenticated;')
    expect(forward).not.toMatch(/to (public|anon)\b/)
  })

  it('relies on the existing 084 owner-scoped RLS instead of adding policies', () => {
    const base = read('scripts/084-profiles-column-grants.sql')
    expect(base).toMatch(/profiles_update_own[\s\S]*auth\.uid\(\) = id/i)
  })

  it('has a rollback that drops only the column and its constraint', () => {
    const sql = rollback.replace(/--.*$/gm, '').replace(/\s+/g, ' ').toLowerCase()
    expect(sql).toContain('alter table public.profiles drop constraint if exists profiles_heard_from_check;')
    expect(sql).toContain('alter table public.profiles drop column if exists heard_from;')
    expect(sql).not.toMatch(/drop table|drop policy/)
  })
})

describe('heard-from UI', () => {
  const card = read('components/dashboard/heard-from-card.tsx')

  it('is optional, accessible and independent of cookie consent / attribution', () => {
    expect(card).toContain('<fieldset')
    expect(card).toContain('<legend')
    expect(card).toContain('htmlFor=')
    expect(card).toContain('type="radio"')
    expect(card).toContain('copy.skip')
    expect(card).not.toMatch(/cookie|consent|attribution|fbq|pixel|capi/i)
  })

  it('has matching TR and EN copy for every choice', () => {
    const i18n = read('lib/i18n.ts')
    const blocks = [...i18n.matchAll(/heardFrom: \{([\s\S]*?)\n\s*\},/g)].map((m) => m[1])
    expect(blocks).toHaveLength(2)
    for (const block of blocks) {
      for (const key of [...HEARD_FROM_VALUES, 'title', 'hint', 'save', 'saving', 'skip', 'thanks', 'error']) {
        expect(block).toMatch(new RegExp(`\\b${key}:`))
      }
    }
  })
})
