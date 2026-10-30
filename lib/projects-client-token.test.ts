import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeClient, type Op, type Row, type Tables } from '@/lib/__fixtures__/fake-supabase'
import { normalizeClientToken } from '@/lib/client-token'
import { fallbackWebsite } from '@/lib/website-schema'

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  log: [] as unknown[],
  userId: 'owner-1',
  /** Simulates migration 088 not being applied: inserts that carry client_token fail like Postgres 42703. */
  tokenColumnMissing: false,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/mail/admin-guard', () => ({ isAdminEmail: () => false }))
vi.mock('@/lib/billing', () => ({ getMyCurrentPlan: vi.fn(), getPlanCodeForUser: async () => 'free' }))
vi.mock('@/lib/effective-limits', () => ({ getEffectiveSiteLimit: vi.fn(), getEffectiveProductLimit: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true, retryAfterMs: 0 }) }))
vi.mock('@/lib/billing-lifecycle', () => ({ isSubscriptionSuspended: vi.fn() }))
vi.mock('@/lib/store-sync', () => ({ syncStoreFromSchema: vi.fn() }))
vi.mock('@/lib/content-attestations', () => ({
  loadAttestedDigests: vi.fn(),
  recordAttestations: vi.fn(),
  selectApproved: vi.fn(),
}))
vi.mock('@/lib/custom-domains/provider', () => ({ getDomainProvider: vi.fn() }))
vi.mock('@/lib/starter-blog-server', () => ({ scheduleStarterBlog: vi.fn() }))
vi.mock('@/lib/service-detail-server', () => ({ scheduleServiceDetails: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }))
vi.mock('@/lib/supabase/server', async () => {
  const { createFakeClient } = await import('@/lib/__fixtures__/fake-supabase')
  return {
    createClient: async () => {
      const fake = createFakeClient(state.tables as Tables, {
        log: state.log as Op[],
        // Models the partial unique index (owner_id, client_token) WHERE client_token IS NOT NULL.
        uniqueKey: (table, row) =>
          table === 'projects' && row.client_token ? `${row.owner_id}:${row.client_token}` : null,
        // RLS: a session only sees the projects it owns.
        visible: (table, row) => (table === 'projects' ? row.owner_id === state.userId : true),
      })
      return {
        auth: { getUser: async () => ({ data: { user: { id: state.userId, email: `${state.userId}@test.dev` } } }) },
        from: (table: string) => {
          const query = fake.from(table)
          if (table !== 'projects' || !state.tokenColumnMissing) return query
          const realInsert = query.insert.bind(query)
          query.insert = (payload: Row | Row[]) => {
            const first = Array.isArray(payload) ? payload[0] : payload
            if (first && 'client_token' in first) {
              return {
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: { code: '42703', message: 'column "client_token" of relation "projects" does not exist' },
                  }),
                }),
              } as unknown as typeof query
            }
            return realInsert(payload)
          }
          return query
        },
      }
    },
  }
})

import { createProject } from '@/lib/projects'

const TOKEN_A = 'site-token-aaaa-1111'
const TOKEN_B = 'site-token-bbbb-2222'

function site() {
  return fallbackWebsite('Test Site', 'tr')
}

function payload(clientToken?: string | null) {
  return { name: 'Test Site', language: 'tr', prompt: 'bir site', schema: site(), clientToken }
}

function projectRows(): Row[] {
  return (state.tables.projects ?? []) as Row[]
}

beforeEach(() => {
  state.tables = { projects: [] }
  state.log = []
  state.userId = 'owner-1'
  state.tokenColumnMissing = false
})

describe('normalizeClientToken', () => {
  it('accepts 8..128 chars of [A-Za-z0-9_-] and trims', () => {
    expect(normalizeClientToken(`  ${TOKEN_A}  `)).toBe(TOKEN_A)
  })

  it('treats short, long, malformed and non-string values as "no token"', () => {
    expect(normalizeClientToken('short')).toBeNull()
    expect(normalizeClientToken('x'.repeat(129))).toBeNull()
    expect(normalizeClientToken('has space in it')).toBeNull()
    expect(normalizeClientToken(undefined)).toBeNull()
    expect(normalizeClientToken(12345678)).toBeNull()
  })
})

describe('createProject idempotency (client_token)', () => {
  it('çift tıklama: two concurrent calls with the same token create ONE row and return the same id', async () => {
    const [first, second] = await Promise.all([createProject(payload(TOKEN_A)), createProject(payload(TOKEN_A))])
    expect(second).toBe(first)
    expect(projectRows()).toHaveLength(1)
    expect(projectRows()[0].client_token).toBe(TOKEN_A)
  })

  it('yeniden deneme: a later retry with the same token returns the existing id without a second row', async () => {
    const first = await createProject(payload(TOKEN_A))
    const retry = await createProject(payload(TOKEN_A))
    expect(retry).toBe(first)
    expect(projectRows()).toHaveLength(1)
  })

  it('A+B kanalı aynı token ile TEK satır: sign-up resume (A) and dashboard hand-off (B) resolve to one project', async () => {
    const channelA = await createProject({ ...payload(), clientToken: TOKEN_A })
    const channelB = await createProject({ ...payload(), clientToken: TOKEN_A })
    expect(channelB).toBe(channelA)
    expect(projectRows().filter((row) => row.client_token === TOKEN_A)).toHaveLength(1)
  })

  it('different tokens for the same owner create separate rows', async () => {
    const a = await createProject(payload(TOKEN_A))
    const b = await createProject(payload(TOKEN_B))
    expect(b).not.toBe(a)
    expect(projectRows()).toHaveLength(2)
  })

  it('token başka sahipte çakışmaz: the same token for another owner creates its own row', async () => {
    const ownerOne = await createProject(payload(TOKEN_A))
    state.userId = 'owner-2'
    const ownerTwo = await createProject(payload(TOKEN_A))
    expect(ownerTwo).not.toBe(ownerOne)
    expect(projectRows().map((row) => row.owner_id).sort()).toEqual(['owner-1', 'owner-2'])
  })

  it('NULL token\'lı eski satır: a legacy row without a token is never matched; token-less creates still insert normally', async () => {
    state.tables.projects = [{ id: 'legacy-1', owner_id: 'owner-1', client_token: null }]
    const withToken = await createProject(payload(TOKEN_A))
    const noToken1 = await createProject(payload(null))
    const noToken2 = await createProject(payload(undefined))
    expect(new Set([withToken, noToken1, noToken2, 'legacy-1']).size).toBe(4)
    expect(projectRows()).toHaveLength(4)
  })

  it('a malformed token is treated as no token (no client_token written)', async () => {
    await createProject(payload('short'))
    expect(projectRows()).toHaveLength(1)
    expect(projectRows()[0].client_token).toBeUndefined()
  })

  it('kolon yokken (088 uygulanmamış): does not throw, inserts without the token', async () => {
    state.tokenColumnMissing = true
    const id = await createProject(payload(TOKEN_A))
    expect(id).toBeTruthy()
    expect(projectRows()).toHaveLength(1)
    expect(projectRows()[0].client_token).toBeUndefined()
  })
})
