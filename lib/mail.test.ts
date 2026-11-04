import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  domains: [] as unknown[],
  provider: {
    listMailboxes: vi.fn(),
    createMailbox: vi.fn(),
  },
}))

vi.mock('@/lib/supabase/request-user', () => ({
  requireRequestUser: async () => ({ id: 'user-1', email: 'owner@example.com' }),
}))
vi.mock('@/lib/custom-domains/service', () => ({}))
vi.mock('@/lib/mail/domain-service', () => ({
  getMyMailDomainGate: vi.fn(),
  getMyMailDomains: async () => state.domains,
  listAllMailDomains: vi.fn(),
}))
vi.mock('@/lib/mail/provider', () => ({
  getMailProvider: () => state.provider,
}))
vi.mock('@/lib/billing', () => ({
  getMyCurrentPlan: async () => null,
  getMySubscription: async () => null,
}))
vi.mock('@/lib/mail/access', () => ({
  getMailQuota: () => ({ allowed: true, maxMailboxes: 5, quotaMbPerBox: 256 }),
}))
vi.mock('@/lib/mail/limits-server', () => ({ loadMailLimitContext: vi.fn() }))
vi.mock('@/lib/mail/password', () => ({ validateMailboxPassword: () => [] }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/mail/admin-guard', () => ({ requireAdmin: vi.fn() }))

import { createMyMailbox } from './mail'

describe('createMyMailbox email access guard', () => {
  beforeEach(() => {
    state.domains = []
    state.provider.listMailboxes.mockClear()
    state.provider.createMailbox.mockClear()
  })

  it('rejects a domain that is not in the caller’s published-site mail domain list', async () => {
    const result = await createMyMailbox({
      domainId: 'unbound-domain',
      localPart: 'hello',
      displayName: 'Hello',
      password: 'ValidPassword123!',
      passwordConfirm: 'ValidPassword123!',
    })

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(state.provider.listMailboxes).not.toHaveBeenCalled()
    expect(state.provider.createMailbox).not.toHaveBeenCalled()
  })
})
