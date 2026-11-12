import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const selectMock = vi.fn()
const inMock = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (columns: string) => {
        selectMock(columns)
        return { in: inMock }
      },
    }),
  }),
}))

import { PROFILE_SELECT, createSupabaseDraftReminderStore } from './store'

// Columns that exist on public.profiles in production.
const EXISTING_PROFILE_COLUMNS = [
  'id',
  'email',
  'full_name',
  'created_at',
  'status',
  'password_reset_blocked_until',
  'password_reset_security_version',
  'heard_from',
  'draft_reminders_opt_out',
  'draft_reminders_opt_out_at',
]

describe('draft reminder store profiles query', () => {
  it('only selects columns that exist on profiles', () => {
    const columns = PROFILE_SELECT.split(',').map((column) => column.trim())
    const unknown = columns.filter((column) => !EXISTING_PROFILE_COLUMNS.includes(column))
    expect(unknown).toEqual([])
    expect(columns).not.toContain('language')
  })

  it('sends exactly that column list and maps rows without a language field', async () => {
    selectMock.mockReset()
    inMock.mockResolvedValue({
      data: [{ id: 'u1', email: 'u1@mail.com', status: 'active', draft_reminders_opt_out: true }],
      error: null,
    })

    const profiles = await createSupabaseDraftReminderStore(new Date('2026-06-30T07:00:00Z')).loadProfiles(['u1'])

    expect(selectMock).toHaveBeenCalledWith(PROFILE_SELECT)
    expect(profiles.get('u1')).toEqual({ id: 'u1', email: 'u1@mail.com', status: 'active', optOut: true })
  })

  it('throws profiles_query_failed when the query errors', async () => {
    inMock.mockResolvedValue({ data: null, error: { message: 'column does not exist' } })
    await expect(
      createSupabaseDraftReminderStore(new Date('2026-06-30T07:00:00Z')).loadProfiles(['u1']),
    ).rejects.toThrow('profiles_query_failed')
  })
})
