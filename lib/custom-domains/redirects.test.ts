import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearRedirectCache, hydrateRedirects } from './redirects'
import { pickCanonicalDomain } from '../site-origin'
import type { CustomDomain } from './types'
import type { VercelClient } from './vercel'

function domain(overrides: Partial<CustomDomain>): CustomDomain {
  return {
    id: 'd1',
    userId: 'u1',
    domain: 'example.com',
    status: 'active',
    isPrimary: false,
    dns: [],
    websiteProjectId: 'p1',
    emailEnabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    verifiedAt: '2026-01-01T00:00:00.000Z',
    connection: { dns: 'configured', vercel: 'connected', ssl: 'ready', lastCheckedAt: null, lastError: null, legacy: false },
    mock: false,
    source: 'external',
    expiresAt: null,
    ...overrides,
  } as CustomDomain
}

const www = domain({ id: 'www', domain: 'www.dbajans.com.tr', isPrimary: true, createdAt: '2026-01-01T00:00:00.000Z' })
const apex = domain({ id: 'apex', domain: 'dbajans.com.tr', createdAt: '2026-03-01T00:00:00.000Z' })

function client(redirects: Record<string, string | null | 'fail'>): VercelClient & { getProjectDomain: ReturnType<typeof vi.fn> } {
  return {
    configured: true,
    addDomain: vi.fn(),
    verifyDomain: vi.fn(),
    getConfig: vi.fn(),
    setRedirect: vi.fn(),
    removeDomain: vi.fn(),
    getProjectDomain: vi.fn(async (name: string) => {
      const r = redirects[name]
      if (r === 'fail') return { ok: false as const, code: 'timeout', message: 'x', status: 0, inconclusive: true }
      return { ok: true as const, verified: true, verification: [], redirect: r ?? null }
    }),
  }
}

describe('hydrateRedirects', () => {
  beforeEach(() => clearRedirectCache())

  it('uses the provider redirect so a www that 308s to the apex loses to the apex', async () => {
    const vercel = client({ 'www.dbajans.com.tr': 'dbajans.com.tr', 'dbajans.com.tr': null })
    const hydrated = await hydrateRedirects([www, apex], vercel)
    expect(hydrated.find((d) => d.id === 'www')?.redirectTo).toBe('dbajans.com.tr')
    expect(hydrated.find((d) => d.id === 'apex')?.redirectTo).toBeNull()
    expect(pickCanonicalDomain(hydrated)?.domain).toBe('dbajans.com.tr')
  })

  it('makes no provider call when there is only one live candidate', async () => {
    const vercel = client({})
    const out = await hydrateRedirects([apex], vercel)
    expect(vercel.getProjectDomain).not.toHaveBeenCalled()
    expect(out[0].redirectTo).toBeUndefined()
  })

  it('leaves redirectTo unknown on a failed lookup and does not cache the failure', async () => {
    const vercel = client({ 'www.dbajans.com.tr': 'fail', 'dbajans.com.tr': null })
    const first = await hydrateRedirects([www, apex], vercel)
    expect(first.find((d) => d.id === 'www')?.redirectTo).toBeUndefined()

    vercel.getProjectDomain.mockClear()
    await hydrateRedirects([www, apex], vercel)
    expect(vercel.getProjectDomain).toHaveBeenCalledWith('www.dbajans.com.tr')
    expect(vercel.getProjectDomain).not.toHaveBeenCalledWith('dbajans.com.tr')
  })

  it('caches successful lookups until the TTL expires', async () => {
    const vercel = client({ 'www.dbajans.com.tr': 'dbajans.com.tr', 'dbajans.com.tr': null })
    let t = 1_000
    await hydrateRedirects([www, apex], vercel, () => t)
    await hydrateRedirects([www, apex], vercel, () => t + 60_000)
    expect(vercel.getProjectDomain).toHaveBeenCalledTimes(2)
    t += 11 * 60_000
    await hydrateRedirects([www, apex], vercel, () => t)
    expect(vercel.getProjectDomain).toHaveBeenCalledTimes(4)
  })

  it('skips the lookup when hosting is not configured', async () => {
    const vercel = { ...client({}), configured: false }
    const out = await hydrateRedirects([www, apex], vercel)
    expect(vercel.getProjectDomain).not.toHaveBeenCalled()
    expect(out).toHaveLength(2)
  })
})
