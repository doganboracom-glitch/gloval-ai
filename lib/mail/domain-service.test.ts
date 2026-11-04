import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomDomain } from '@/lib/custom-domains/types'

const state = vi.hoisted(() => ({
  domains: [] as CustomDomain[],
  projects: [] as Array<{ id: string; published: boolean; slug?: string | null }>,
  heldIds: new Set<string>(),
  provider: { ensureDomain: undefined as undefined | ((domain: unknown) => Promise<unknown>) },
}))

vi.mock('@/lib/custom-domains/service', () => ({
  listDomainsForUser: async () => state.domains,
}))
vi.mock('@/lib/projects', () => ({
  listProjects: async () => state.projects,
}))
vi.mock('@/lib/custom-domains/handover/hold', () => ({
  listHeldDomainIds: async () => state.heldIds,
}))
vi.mock('@/lib/mail/provider', () => ({
  getMailProvider: () => state.provider,
}))
vi.mock('@/lib/billing', () => ({
  getMyCurrentPlan: async () => null,
  getMySubscription: async () => null,
}))
vi.mock('@/lib/mail/access', () => ({
  getMailQuota: () => ({ allowed: false, maxMailboxes: 0 }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { getMyMailDomainGate, getMyMailDomains } from './domain-service'

function makeDomain(overrides: Partial<CustomDomain> = {}): CustomDomain {
  return {
    id: 'domain-1',
    userId: 'user-1',
    domain: 'example.com',
    status: 'active',
    isPrimary: false,
    dns: [],
    websiteProjectId: null,
    emailEnabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    verifiedAt: '2026-01-01T00:00:00.000Z',
    connection: {
      dns: 'configured',
      vercel: 'connected',
      ssl: 'ready',
      lastCheckedAt: null,
      lastError: null,
      legacy: false,
    },
    mock: false,
    source: 'registrar',
    expiresAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  state.domains = []
  state.projects = []
  state.heldIds = new Set()
  state.provider = { ensureDomain: undefined }
})

describe('server-side email domain gate', () => {
  it('excludes an active domain that has not been bound to a website', async () => {
    state.domains = [makeDomain()]
    await expect(getMyMailDomains('user-1')).resolves.toEqual([])
    await expect(getMyMailDomainGate('user-1')).resolves.toMatchObject({ state: 'website_not_connected' })
  })

  it('excludes a project that is not published', async () => {
    state.domains = [makeDomain({ websiteProjectId: 'project-1' })]
    state.projects = [{ id: 'project-1', published: false, slug: null }]
    await expect(getMyMailDomains('user-1')).resolves.toEqual([])
  })

  it('excludes a bound published project when the domain is not live', async () => {
    state.domains = [
      makeDomain({
        websiteProjectId: 'project-1',
        connection: {
          dns: 'configured',
          vercel: 'connected',
          ssl: 'pending',
          lastCheckedAt: null,
          lastError: null,
          legacy: false,
        },
      }),
    ]
    state.projects = [{ id: 'project-1', published: true, slug: 'site' }]
    await expect(getMyMailDomains('user-1')).resolves.toEqual([])
  })

  it('returns the owner’s mail domain only when the binding is published and live', async () => {
    state.domains = [makeDomain({ websiteProjectId: 'project-1' })]
    state.projects = [{ id: 'project-1', published: true, slug: 'site' }]
    await expect(getMyMailDomains('user-1')).resolves.toMatchObject([
      { id: 'domain-1', userId: 'user-1', domain: 'example.com', status: 'active' },
    ])
  })
})
