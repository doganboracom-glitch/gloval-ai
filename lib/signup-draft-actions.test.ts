import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  admin: {},
  claimDraft: vi.fn(),
  completeIdeaDraft: vi.fn(),
  createDraft: vi.fn(),
  reserveDraftIpSlot: vi.fn(),
  createProject: vi.fn(),
  headers: vi.fn(),
  cookies: vi.fn(),
  hashIp: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: mocks.headers,
  cookies: mocks.cookies,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.admin }))
vi.mock('@/lib/anon-ai-limit', () => ({ hashedIpFromHeaders: mocks.hashIp }))
vi.mock('@/lib/projects', () => ({ createProject: mocks.createProject }))
vi.mock('@/lib/signup-draft-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/signup-draft-store')>()
  return {
    ...actual,
    claimDraft: mocks.claimDraft,
    completeIdeaDraft: mocks.completeIdeaDraft,
    createDraft: mocks.createDraft,
    reserveDraftIpSlot: mocks.reserveDraftIpSlot,
  }
})

import {
  persistSignupIdeaForCurrentUser,
  restoreSignupIdeaFromCookie,
  resumeSignupDraft,
} from '@/lib/signup-draft-actions'
import { SIGNUP_IDEA_RESTORE_COOKIE } from '@/lib/signup-draft-shared'

const TOKEN = 'a'.repeat(43)
const PROMPT = 'Bir kahve sitesi kur'
const cookieStore = {
  get: mocks.cookieGet,
  set: mocks.cookieSet,
  delete: mocks.cookieDelete,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'ada@gloval.ai' } } })
  mocks.claimDraft.mockResolvedValue({
    status: 'claimed',
    id: 'draft-1',
    payload: { kind: 'idea', prompt: PROMPT },
  })
  mocks.completeIdeaDraft.mockResolvedValue(undefined)
  mocks.createDraft.mockResolvedValue(TOKEN)
  mocks.reserveDraftIpSlot.mockResolvedValue(true)
  mocks.headers.mockResolvedValue(new Headers())
  mocks.hashIp.mockReturnValue('hashed-ip')
  mocks.cookies.mockResolvedValue(cookieStore)
  mocks.cookieGet.mockReturnValue({ value: TOKEN })
})

describe('resumeSignupDraft for idea-only payloads', () => {
  it('returns the prompt without creating a project', async () => {
    await expect(resumeSignupDraft(TOKEN)).resolves.toEqual({ status: 'idea', prompt: PROMPT })
    expect(mocks.completeIdeaDraft).toHaveBeenCalledWith(mocks.admin, 'draft-1', {
      kind: 'idea',
      prompt: PROMPT,
    })
    expect(mocks.createProject).not.toHaveBeenCalled()
  })

  it('persists a logged-in visitor idea through the existing draft limits', async () => {
    await expect(persistSignupIdeaForCurrentUser(PROMPT)).resolves.toEqual({
      status: 'idea',
      prompt: PROMPT,
    })
    expect(mocks.reserveDraftIpSlot).toHaveBeenCalledWith(mocks.admin, 'hashed-ip')
    expect(mocks.createDraft).toHaveBeenCalledWith(mocks.admin, {
      email: 'ada@gloval.ai',
      payload: { kind: 'idea', prompt: PROMPT },
    })
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      SIGNUP_IDEA_RESTORE_COOKIE,
      TOKEN,
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 300 }),
    )
    expect(mocks.createProject).not.toHaveBeenCalled()
  })

  it('restores a claimed idea from the short-lived cookie and consumes it', async () => {
    mocks.claimDraft.mockResolvedValue({ status: 'done_idea', prompt: PROMPT })
    await expect(restoreSignupIdeaFromCookie()).resolves.toEqual({ status: 'idea', prompt: PROMPT })
    expect(mocks.cookieDelete).toHaveBeenCalledWith(SIGNUP_IDEA_RESTORE_COOKIE)
    expect(mocks.createProject).not.toHaveBeenCalled()
  })
})
