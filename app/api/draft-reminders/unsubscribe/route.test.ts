import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const eqMock = vi.fn()
const updateMock = vi.fn(() => ({ eq: eqMock }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ update: updateMock }) }) }))

import { createOptOutToken } from '@/lib/draft-reminders/token'
import { GET, POST } from './route'

const USER = '3f2b8c1e-9d4a-4e6b-8a1c-2b7d5e9f0a11'
const URL_BASE = 'https://gloval.ai/api/draft-reminders/unsubscribe'

function post(token: string, origin: string | null = 'https://gloval.ai') {
  const body = new URLSearchParams({ token })
  return POST(
    new Request(URL_BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...(origin ? { origin } : {}) },
      body,
    }),
  )
}

describe('draft reminder opt-out', () => {
  beforeEach(() => {
    updateMock.mockClear()
    eqMock.mockReset().mockResolvedValue({ error: null })
    vi.stubEnv('DRAFT_REMINDERS_TOKEN_SECRET', 'unit-test-secret-0123456789')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('GET only renders a confirmation form and never opts anyone out', async () => {
    const token = createOptOutToken(USER) as string
    const res = await GET(new Request(`${URL_BASE}?token=${encodeURIComponent(token)}`))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('method="post"')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('GET rejects an invalid token', async () => {
    expect((await GET(new Request(`${URL_BASE}?token=bad`))).status).toBe(400)
  })

  it('POST with a valid token opts the user out, and is idempotent', async () => {
    const token = createOptOutToken(USER) as string
    expect((await post(token)).status).toBe(200)
    expect((await post(token)).status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ draft_reminders_opt_out: true }))
    expect(eqMock).toHaveBeenCalledWith('id', USER)
  })

  it('POST rejects invalid tokens and foreign origins', async () => {
    const token = createOptOutToken(USER) as string
    expect((await post('bad')).status).toBe(400)
    expect((await post(token, 'https://evil.test')).status).toBe(400)
    expect((await post(token, null)).status).toBe(400)
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('POST reports a database failure instead of a false success', async () => {
    eqMock.mockResolvedValue({ error: { message: 'x' } })
    const token = createOptOutToken(USER) as string
    expect((await post(token)).status).toBe(503)
  })
})
