import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isDirectProjectBindAllowed } from './types'

const OWNER = 'user-1'
const PURCHASED_ID = '11111111-1111-4111-8111-111111111111'
const BOUND_PURCHASED_ID = '22222222-2222-4222-8222-222222222222'
const EXTERNAL_ID = '33333333-3333-4333-8333-333333333333'
const FOREIGN_ID = '44444444-4444-4444-8444-444444444444'
const PROJECT_ID = 'project-1'

const state = vi.hoisted(() => ({
  provider: null as unknown,
  db: null as unknown,
  user: null as { id: string } | null,
}))

const hosting = vi.hoisted(() => ({
  configured: true,
  addDomain: vi.fn(),
  verifyDomain: vi.fn(),
  getConfig: vi.fn(),
  removeDomain: vi.fn(),
  setRedirect: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.db }))
vi.mock('@/lib/billing', () => ({ getMyCurrentPlan: vi.fn(), getMySubscription: vi.fn() }))
vi.mock('@/lib/mail/provider', () => ({ getMailProvider: vi.fn() }))
vi.mock('@/lib/mail/access', () => ({ getMailQuota: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
vi.mock('./registrar/provider', () => ({ isLiveDomainRegistrar: () => false }))
vi.mock('./registrar/actions', () => ({ getMyDomainOrders: vi.fn() }))
vi.mock('@/lib/projects', () => ({
  getProject: async (id: string) => (id === PROJECT_ID ? { id, owner_id: OWNER, published: true, slug: 'site' } : null),
}))
vi.mock('./provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./provider')>()),
  getDomainProvider: () => state.provider,
}))
vi.mock('./vercel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./vercel')>()),
  getVercelClient: () => hosting,
}))

import { bindMyDomainWebsite, syncMyDomainToProject } from './actions'
import { SupabaseDomainProvider } from './supabase-provider'

type Row = Record<string, unknown>

/** Minimal stateful PostgREST stand-in: filters, updates and the cron's `or()` clause. */
function createDb(seed: Row[]) {
  const rows = seed.map((r) => ({ ...r }))

  function matchClause(r: Row, clause: string): boolean {
    const m = /^(\w+)\.(not\.is\.null|neq\.(.+))$/.exec(clause)
    if (!m) throw new Error(`fake db: unsupported or() clause ${clause}`)
    const value = r[m[1]]
    return m[2] === 'not.is.null' ? value !== null : value != null && value !== m[3]
  }

  class Query implements PromiseLike<unknown> {
    private op: 'select' | 'update' = 'select'
    private patch: Row = {}
    private preds: Array<(r: Row) => boolean> = []
    private max = Infinity

    select() {
      return this
    }
    update(patch: Row) {
      this.op = 'update'
      this.patch = patch
      return this
    }
    eq(col: string, value: unknown) {
      this.preds.push((r) => r[col] === value)
      return this
    }
    neq(col: string, value: unknown) {
      this.preds.push((r) => r[col] != null && r[col] !== value)
      return this
    }
    is(col: string, value: unknown) {
      this.preds.push((r) => r[col] === value)
      return this
    }
    not(col: string, op: string, value: unknown) {
      if (op !== 'is') throw new Error(`fake db: unsupported not() op ${op}`)
      this.preds.push((r) => r[col] !== value)
      return this
    }
    or(expr: string) {
      const clauses = expr.split(',')
      this.preds.push((r) => clauses.some((c) => matchClause(r, c)))
      return this
    }
    order() {
      return this
    }
    limit(n: number) {
      this.max = n
      return this
    }
    maybeSingle() {
      return Promise.resolve(this.run(true))
    }
    then<T1 = unknown, T2 = never>(
      onfulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ) {
      return Promise.resolve(this.run(false)).then(onfulfilled, onrejected)
    }
    private run(single: boolean) {
      const matched = rows.filter((r) => this.preds.every((p) => p(r))).slice(0, this.max)
      if (this.op === 'update') for (const r of matched) Object.assign(r, this.patch)
      return { data: single ? (matched[0] ?? null) : matched, error: null }
    }
  }

  return { rows, client: { from: () => new Query() } as unknown as SupabaseClient }
}

function row(overrides: Row = {}): Row {
  return {
    id: PURCHASED_ID,
    user_id: OWNER,
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

let db: ReturnType<typeof createDb>

function load(seed: Row[]) {
  db = createDb(seed)
  state.db = db.client
  state.provider = new SupabaseDomainProvider(db.client)
}

const stored = (id: string) => db.rows.find((r) => r.id === id)!

function hostingCalls(): number {
  return [hosting.addDomain, hosting.verifyDomain, hosting.getConfig, hosting.removeDomain, hosting.setRedirect].reduce(
    (sum, fn) => sum + fn.mock.calls.length,
    0,
  )
}

beforeEach(() => {
  state.user = { id: OWNER }
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

describe('isDirectProjectBindAllowed', () => {
  it('refuses a project bind on a purchased domain', () => {
    expect(isDirectProjectBindAllowed({ source: 'registrar' }, PROJECT_ID)).toBe(false)
  })

  it('allows unbinding a purchased domain and any bind on an external one', () => {
    expect(isDirectProjectBindAllowed({ source: 'registrar' }, null)).toBe(true)
    expect(isDirectProjectBindAllowed({ source: 'external' }, PROJECT_ID)).toBe(true)
  })
})

describe('bindMyDomainWebsite', () => {
  it('rejects binding a purchased domain and leaves the row and hosting untouched', async () => {
    load([row()])

    const result = await bindMyDomainWebsite(PURCHASED_ID, PROJECT_ID)

    expect(result).toEqual({ ok: false, error: 'USE_PROJECT_SYNC' })
    expect(stored(PURCHASED_ID).website_project_id).toBeNull()
    expect(hostingCalls()).toBe(0)
  })

  it('still lets the owner unbind a purchased domain, without touching hosting', async () => {
    load([row({ website_project_id: PROJECT_ID })])

    const result = await bindMyDomainWebsite(PURCHASED_ID, null)

    expect(result.ok).toBe(true)
    expect(stored(PURCHASED_ID).website_project_id).toBeNull()
    expect(hostingCalls()).toBe(0)
  })

  it('keeps the external-domain bind working', async () => {
    load([row({ id: EXTERNAL_ID, domain: 'dis.com', provider: 'external', ssl_status: 'ready', vercel_status: 'connected', dns_status: 'ready' })])

    const result = await bindMyDomainWebsite(EXTERNAL_ID, PROJECT_ID)

    expect(result.ok).toBe(true)
    expect(stored(EXTERNAL_ID).website_project_id).toBe(PROJECT_ID)
  })

  it('does not let a caller bind a domain they do not own', async () => {
    load([row({ id: FOREIGN_ID, user_id: 'someone-else' })])

    expect(await bindMyDomainWebsite(FOREIGN_ID, PROJECT_ID)).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(stored(FOREIGN_ID).website_project_id).toBeNull()
  })
})

describe('syncMyDomainToProject', () => {
  it('binds the project and attaches the apex and www in one step', async () => {
    load([row()])

    const result = await syncMyDomainToProject(PURCHASED_ID, PROJECT_ID)

    expect(result.ok).toBe(true)
    expect(stored(PURCHASED_ID).website_project_id).toBe(PROJECT_ID)
    expect(hosting.addDomain).toHaveBeenCalledWith('firma.com')
    expect(hosting.addDomain).toHaveBeenCalledWith('www.firma.com', { redirectTo: 'firma.com' })
  })

  it('rolls back the bind and detaches the hostname when hosting rejects a first-time sync', async () => {
    load([row()])
    hosting.addDomain.mockImplementation(async (host: string) =>
      host === 'firma.com' ? { ok: false, code: 'forbidden', message: 'denied', status: 403 } : { ok: true, verified: true, verification: [] },
    )

    const result = await syncMyDomainToProject(PURCHASED_ID, PROJECT_ID)

    expect(result).toEqual({ ok: false, error: 'SYNC_FAILED' })
    expect(stored(PURCHASED_ID).website_project_id).toBeNull()
    expect(hosting.removeDomain).toHaveBeenCalledWith('www.firma.com')
    expect(hosting.removeDomain).toHaveBeenCalledWith('firma.com')
  })

  it('restores the previous project and keeps the hostname attached when a re-sync fails', async () => {
    load([row({ website_project_id: 'project-old', vercel_status: 'connected' })])
    hosting.addDomain.mockResolvedValue({ ok: false, code: 'forbidden', message: 'denied', status: 403 })

    const result = await syncMyDomainToProject(PURCHASED_ID, PROJECT_ID)

    expect(result).toEqual({ ok: false, error: 'SYNC_FAILED' })
    expect(stored(PURCHASED_ID).website_project_id).toBe('project-old')
    expect(hosting.removeDomain).not.toHaveBeenCalled()
  })

  it('fails closed without binding anything when the hosting integration is not configured', async () => {
    load([row()])
    hosting.configured = false

    const result = await syncMyDomainToProject(PURCHASED_ID, PROJECT_ID)

    expect(result).toEqual({ ok: false, error: 'SYNC_FAILED' })
    expect(stored(PURCHASED_ID).website_project_id).toBeNull()
    expect(hostingCalls()).toBe(0)
  })

  it('refuses a domain that belongs to another account', async () => {
    load([row({ id: FOREIGN_ID, user_id: 'someone-else' })])

    expect(await syncMyDomainToProject(FOREIGN_ID, PROJECT_ID)).toEqual({ ok: false, error: 'FORBIDDEN' })
    expect(hostingCalls()).toBe(0)
  })
})

describe('reconciliation cron', () => {
  it('never attaches an unbound purchased domain, but still reconciles bound and external ones', async () => {
    load([
      row(),
      row({ id: BOUND_PURCHASED_ID, domain: 'bagli.com', website_project_id: PROJECT_ID }),
      row({ id: EXTERNAL_ID, domain: 'dis.com', provider: 'external' }),
    ])
    const provider = state.provider as SupabaseDomainProvider

    const refreshed = await provider.refreshPendingConnections()

    expect(refreshed).toBe(2)
    const attached = hosting.addDomain.mock.calls.map(([host]) => host as string)
    expect(attached).toContain('bagli.com')
    expect(attached).toContain('dis.com')
    expect(attached).not.toContain('firma.com')
    expect(attached).not.toContain('www.firma.com')
    expect(stored(PURCHASED_ID).last_checked_at).toBeNull()
  })

  it('attaches the purchased domain only after the owner has synced it to a project', async () => {
    load([row()])
    const provider = state.provider as SupabaseDomainProvider

    await provider.refreshPendingConnections()
    expect(hostingCalls()).toBe(0)

    await syncMyDomainToProject(PURCHASED_ID, PROJECT_ID)
    expect(hosting.addDomain).toHaveBeenCalledWith('firma.com')
  })
})
