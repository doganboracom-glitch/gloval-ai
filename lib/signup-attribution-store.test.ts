import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SIGNUP_ATTRIBUTION_RETENTION_MONTHS, sweepOldSignupAttribution } from './signup-attribution-store'

function fakeAdmin(result: { data: unknown[] | null; error: Error | null }) {
  const lt = vi.fn(() => ({ select: vi.fn(async () => result) }))
  const del = vi.fn(() => ({ lt }))
  const from = vi.fn(() => ({ delete: del }))
  return { admin: { from } as unknown as SupabaseClient, from, lt }
}

describe('sweepOldSignupAttribution', () => {
  it('deletes rows created more than 24 months before now', async () => {
    const { admin, from, lt } = fakeAdmin({ data: [{ user_id: 'a' }, { user_id: 'b' }], error: null })
    const now = Date.UTC(2026, 9, 14, 3, 0, 0)

    const deleted = await sweepOldSignupAttribution(admin, now)

    expect(SIGNUP_ATTRIBUTION_RETENTION_MONTHS).toBe(24)
    expect(deleted).toBe(2)
    expect(from).toHaveBeenCalledWith('signup_attribution')
    expect(lt).toHaveBeenCalledWith('created_at', new Date(Date.UTC(2024, 9, 14, 3, 0, 0)).toISOString())
  })

  it('returns 0 when nothing is old enough', async () => {
    const { admin } = fakeAdmin({ data: [], error: null })
    expect(await sweepOldSignupAttribution(admin, Date.now())).toBe(0)
  })

  it('throws so the cron can report the failure', async () => {
    const { admin } = fakeAdmin({ data: null, error: new Error('boom') })
    await expect(sweepOldSignupAttribution(admin, Date.now())).rejects.toThrow('boom')
  })
})
