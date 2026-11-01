// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  updateUserById: vi.fn(),
  profileMaybeSingle: vi.fn(),
  profileUpdate: vi.fn(),
  securityInsert: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        listUsers: mocks.listUsers,
        updateUserById: mocks.updateUserById,
      },
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: mocks.profileMaybeSingle }),
          }),
          update: (values: unknown) => ({
            eq: () => {
              mocks.profileUpdate(values)
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      return {
        insert: (values: unknown) => {
          mocks.securityInsert(values)
          return Promise.resolve({ error: null })
        },
      }
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  }),
}))
vi.mock('@/lib/db-guard', () => ({ warnOnError: vi.fn() }))

import { POST } from './route'

const now = new Date('2026-11-01T12:00:00.000Z')
const user = {
  id: 'user-1',
  email: 'member@example.test',
  user_metadata: { email_locale: 'tr' },
}

function request(email = user.email) {
  return new Request('https://gloval.ai/api/auth/forgot-password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept-language': 'tr',
    },
    body: JSON.stringify({ email }),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  vi.clearAllMocks()
  mocks.listUsers.mockResolvedValue({ data: { users: [user] }, error: null })
  mocks.profileMaybeSingle.mockResolvedValue({
    data: { password_reset_blocked_until: null },
    error: null,
  })
  mocks.profileUpdate.mockResolvedValue({ error: null })
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/auth/forgot-password', () => {
  it('stores a 60-second server-side block before sending a reset email', async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      password_reset_blocked_until: new Date(now.getTime() + 60_000).toISOString(),
    })
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledOnce()
  })

  it('returns the same response for a blocked registered address and an unknown address', async () => {
    const blockedUser = {
      data: { users: [user] },
      error: null,
    }
    mocks.listUsers
      .mockResolvedValueOnce(blockedUser)
      .mockResolvedValueOnce({ data: { users: [] }, error: null })
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { password_reset_blocked_until: new Date(now.getTime() + 30_000).toISOString() },
      error: null,
    })

    const blocked = await POST(request())
    const unknown = await POST(request('unknown@example.test'))

    expect(blocked.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(await blocked.json()).toEqual(await unknown.json())
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled()
  })
})
