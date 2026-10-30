import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const mocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  countUnread: vi.fn(),
  entitlementsResult: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: 'user-1',
            email: 'a@b.co',
            email_confirmed_at: '2024-01-01',
            created_at: '2020-01-01',
          },
        },
      }),
    },
    from: () => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => mocks.entitlementsResult())
          .then(resolve, reject)
      return chain
    },
  }),
}))

vi.mock('@/lib/projects', () => ({ listProjects: mocks.listProjects }))
vi.mock('@/lib/billing', () => ({
  getMyCurrentPlan: async () => null,
  getMySubscription: async () => null,
}))
vi.mock('@/lib/aura-cursor-feature-flag', () => ({ isAuraCursorFeatureUiEnabled: () => false }))
vi.mock('@/components/dashboard/dashboard-client', () => ({ DashboardClient: () => null }))
vi.mock('@/components/credit-notice-toast', () => ({ CreditNoticeToast: () => null }))
vi.mock('@/lib/billing-profile-actions', () => ({
  getMyBillingProfileStatusAction: async () => ({ available: false, complete: false }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/email-outbox', () => ({
  isWithinWelcomeWindow: () => false,
  scheduleWelcomeEmail: vi.fn(),
}))
vi.mock('@/lib/site-contact-store', () => ({
  countOwnerUnreadContactMessages: mocks.countUnread,
}))

import DashboardPage from '@/app/dashboard/page'

type Props = {
  projects: unknown[]
  unreadMessages: number
  auraSiteIds: string[]
}

async function renderProps(): Promise<Props> {
  const tree = (await DashboardPage()) as ReactElement<{ children: ReactElement[] }>
  const client = tree.props.children[1] as ReactElement<Props>
  return client.props
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.listProjects.mockReset().mockResolvedValue([{ id: 'p1' }])
  mocks.countUnread.mockReset().mockResolvedValue(3)
  mocks.entitlementsResult.mockReset().mockReturnValue({
    data: [{ project_id: 'p1' }],
    error: null,
  })
})

describe('dashboard page resilience', () => {
  it('passes real values through on the happy path', async () => {
    const props = await renderProps()
    expect(props.projects).toEqual([{ id: 'p1' }])
    expect(props.unreadMessages).toBe(3)
    expect(props.auraSiteIds).toEqual(['p1'])
  })

  it('unreadMessages failure falls back to 0 and the panel still renders', async () => {
    mocks.countUnread.mockRejectedValue(new Error('rpc down'))
    const props = await renderProps()
    expect(props.unreadMessages).toBe(0)
    expect(props.projects).toEqual([{ id: 'p1' }])
  })

  it('auraRights query error falls back to an empty list', async () => {
    mocks.entitlementsResult.mockReturnValue({ data: null, error: new Error('rls') })
    const props = await renderProps()
    expect(props.auraSiteIds).toEqual([])
    expect(props.projects).toEqual([{ id: 'p1' }])
  })

  it('auraRights thrown failure falls back to an empty list', async () => {
    mocks.entitlementsResult.mockImplementation(() => {
      throw new Error('network')
    })
    const props = await renderProps()
    expect(props.auraSiteIds).toEqual([])
  })

  it('projects query is retried once after a transient failure', async () => {
    mocks.listProjects.mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce([{ id: 'p2' }])
    const props = await renderProps()
    expect(mocks.listProjects).toHaveBeenCalledTimes(2)
    expect(props.projects).toEqual([{ id: 'p2' }])
  })

  it('projects query stays critical: a second failure still throws', async () => {
    mocks.listProjects.mockRejectedValue(new Error('db down'))
    await expect(DashboardPage()).rejects.toThrow('db down')
    expect(mocks.listProjects).toHaveBeenCalledTimes(2)
  })
})
