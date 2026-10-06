import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CONNECTION, isHostingAttachAllowed, type CustomDomain } from './types'

const hosting = vi.hoisted(() => ({
  configured: true,
  addDomain: vi.fn(),
  verifyDomain: vi.fn(),
  getConfig: vi.fn(),
  removeDomain: vi.fn(),
  setRedirect: vi.fn(),
}))

vi.mock('./vercel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./vercel')>()),
  getVercelClient: () => hosting,
}))

import { SupabaseDomainProvider } from './supabase-provider'

function domain(overrides: Partial<CustomDomain> = {}): CustomDomain {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-1',
    domain: 'firma.com',
    status: 'active',
    isPrimary: false,
    dns: [],
    websiteProjectId: null,
    emailEnabled: false,
    createdAt: '2026-01-01T00:00:00Z',
    verifiedAt: '2026-01-01T00:00:00Z',
    connection: { ...EMPTY_CONNECTION },
    mock: false,
    source: 'registrar',
    expiresAt: null,
    ...overrides,
  }
}

/** Chainable stand-in for the PostgREST builder; records every table touched. */
function fakeDb(row: Record<string, unknown>) {
  const queries: string[] = []
  const chain: unknown = new Proxy(() => undefined, {
    get(_target, prop) {
      if (prop === 'then') return undefined
      if (prop === 'maybeSingle') return () => Promise.resolve({ data: row, error: null })
      return () => chain
    },
  })
  const client = {
    from: (table: string) => {
      queries.push(table)
      return chain
    },
  } as unknown as SupabaseClient
  return { client, queries }
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: 'user-1',
    domain: 'firma.com',
    status: 'active',
    is_primary: false,
    dns: [],
    website_project_id: null,
    email_enabled: false,
    verified_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    verification_token: 'tok',
    dns_status: 'pending',
    vercel_status: 'not_configured',
    ssl_status: 'pending',
    last_checked_at: null,
    last_error: null,
    provider: 'domainnameapi',
    expires_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  hosting.configured = true
  hosting.addDomain.mockResolvedValue({ ok: true, verified: true, verification: [] })
  hosting.verifyDomain.mockResolvedValue({ ok: true, verified: true, verification: [] })
  hosting.getConfig.mockResolvedValue({ misconfigured: false, recommendedIPv4: [], recommendedCNAME: [] })
  hosting.removeDomain.mockResolvedValue({ ok: true })
  hosting.setRedirect.mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function hostingCalls(): number {
  return [hosting.addDomain, hosting.verifyDomain, hosting.getConfig, hosting.removeDomain, hosting.setRedirect].reduce(
    (sum, fn) => sum + fn.mock.calls.length,
    0,
  )
}

describe('isHostingAttachAllowed', () => {
  it('blocks a registrar-bought domain until a project is chosen', () => {
    expect(isHostingAttachAllowed(domain())).toBe(false)
  })

  it('allows a registrar-bought domain once it is bound to a project', () => {
    expect(isHostingAttachAllowed(domain({ websiteProjectId: 'p1' }))).toBe(true)
  })

  it('allows external domains, which are always created bound', () => {
    expect(isHostingAttachAllowed(domain({ source: 'external', websiteProjectId: 'p1' }))).toBe(true)
  })

  it('never attaches a disabled domain', () => {
    expect(isHostingAttachAllowed(domain({ websiteProjectId: 'p1', status: 'disabled' }))).toBe(false)
  })
})

describe('purchased domain is not attached to hosting before sync', () => {
  it('refreshConnection makes no hosting call and no write for an unbound registrar domain', async () => {
    const { client, queries } = fakeDb(row())
    const provider = new SupabaseDomainProvider(client)

    const result = await provider.refreshConnection(domain())

    expect(result.connection.vercel).toBe('not_configured')
    expect(hostingCalls()).toBe(0)
    expect(queries).toEqual([])
  })

  it('syncConnection (the explicit sync path) is a no-op while the domain is unbound', async () => {
    const { client } = fakeDb(row())
    const provider = new SupabaseDomainProvider(client)

    await provider.syncConnection('11111111-1111-4111-8111-111111111111').catch(() => undefined)

    expect(hosting.addDomain).not.toHaveBeenCalled()
  })

  it('attaches exactly once the domain is bound to a project', async () => {
    const bound = domain({ websiteProjectId: 'p1' })
    const { client } = fakeDb(row({ website_project_id: 'p1' }))
    const provider = new SupabaseDomainProvider(client)

    await provider.refreshConnection(bound)

    expect(hosting.addDomain).toHaveBeenCalledWith('firma.com')
  })
})

describe('purchase code paths stay free of hosting calls', () => {
  const files = [
    'registrar/service.ts',
    'registrar/renewal-service.ts',
    'registrar/transfer-service.ts',
    'registrar/manage-service.ts',
  ]

  it.each(files)('%s never imports or calls the hosting client', (file) => {
    const source = readFileSync(join(__dirname, file), 'utf8')
    expect(source).not.toMatch(/from ['"][^'"]*\/vercel['"]/)
    expect(source).not.toMatch(/getVercelClient|syncConnection|refreshConnection/)
  })
})

describe('startVerification (external domains)', () => {
  function recordingDb(r: Record<string, unknown>) {
    const updates: Record<string, unknown>[] = []
    const chain: unknown = new Proxy(() => undefined, {
      get(_target, prop) {
        if (prop === 'then') return undefined
        if (prop === 'maybeSingle') return () => Promise.resolve({ data: r, error: null })
        if (prop === 'update') {
          return (patch: Record<string, unknown>) => {
            updates.push(patch)
            return chain
          }
        }
        return () => chain
      },
    })
    return { client: { from: () => chain } as unknown as SupabaseClient, updates }
  }

  it('reuses the stored verification token instead of issuing a new one', async () => {
    const { client, updates } = recordingDb(row({ status: 'pending', provider: 'external', verified_at: null, verification_token: 'existing-token' }))
    const provider = new SupabaseDomainProvider(client)
    await provider.startVerification('11111111-1111-4111-8111-111111111111')

    // updates[0] is the start itself; any later write is the best-effort connection refresh.
    expect(updates[0].status).toBe('verifying')
    expect(updates[0]).not.toHaveProperty('verification_token')
    const records = updates[0].dns as { value: string }[]
    expect(records.some((rec) => rec.value.endsWith('existing-token'))).toBe(true)
  })

  it('leaves a domain that is already verifying untouched', async () => {
    const { client, updates } = recordingDb(row({ status: 'verifying', provider: 'external', verified_at: null }))
    const provider = new SupabaseDomainProvider(client)
    const result = await provider.startVerification('11111111-1111-4111-8111-111111111111')

    expect(updates).toHaveLength(0)
    expect(result.status).toBe('verifying')
  })

  it('refuses a registrar-bought domain', async () => {
    const { client } = recordingDb(row({ status: 'pending', provider: 'domainnameapi' }))
    const provider = new SupabaseDomainProvider(client)
    await expect(provider.startVerification('11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
