import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: mocks.getUserById } },
    from: () => ({ upsert: mocks.upsert }),
  }),
}))

import { saveSignupAttribution } from './signup-attribution'

const userId = '5b3f3de9-9039-4ef9-9095-82c8f37bfeb2'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUserById.mockResolvedValue({
    data: { user: { id: userId, created_at: new Date().toISOString() } },
    error: null,
  })
  mocks.upsert.mockResolvedValue({ error: null })
})

describe('saveSignupAttribution', () => {
  it('stores first-touch values insert-only and persists click presence, not click IDs', async () => {
    const capturedAt = Date.now()
    const result = await saveSignupAttribution({
      userId,
      attribution: {
        params: {
          utm_source: 'google',
          utm_medium: 'cpc',
          utm_campaign: 'launch',
          utm_content: 'hero',
          utm_term: 'site builder',
          gclid: true,
          fbclid: false,
        },
        landing_path: '/paketler',
        captured_at: capturedAt,
      },
    })

    expect(result).toEqual({ ok: true })
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        utm_source: 'google',
        gclid: 'true',
        fbclid: 'false',
      }),
      { onConflict: 'user_id', ignoreDuplicates: true },
    )
  })

  it('does not write attribution for an established account', async () => {
    mocks.getUserById.mockResolvedValueOnce({
      data: { user: { id: userId, created_at: new Date(Date.now() - 16 * 60_000).toISOString() } },
      error: null,
    })

    const result = await saveSignupAttribution({
      userId,
      attribution: {
        params: { utm_source: 'meta', gclid: true },
        landing_path: '/',
        captured_at: Date.now(),
      },
    })

    expect(result).toEqual({ ok: false })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
