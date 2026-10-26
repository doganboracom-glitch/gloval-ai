import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>
type Err = { code: string; message: string } | null

const db = vi.hoisted(() => ({
  userId: 'user-1' as string | null,
  tables: {} as Record<string, Row[]>,
  storageFiles: {} as Record<string, string[]>,
  storageFailOn: null as string | null,
  hostFailures: new Set<string>(),
  removedHosts: [] as string[],
  failOn: null as string | null,
  calls: [] as string[],
}))

function seed() {
  db.userId = 'user-1'
  db.storageFailOn = null
  db.hostFailures = new Set()
  db.removedHosts = []
  db.failOn = null
  db.calls = []
  db.storageFiles = {
    'site-images/products/p1': ['a.png', 'b.png'],
    'site-images/ai-candidates/p1': ['c.png'],
    'site-images/previews/user-1': ['preview.png'],
    'site-images/products/p2': ['other-site.png'],
  }
  db.tables = {
    projects: [
      { id: 'p1', owner_id: 'user-1' },
      { id: 'p2', owner_id: 'user-1' },
      { id: 'p9', owner_id: 'user-2' },
    ],
    custom_domains: [
      { id: 'cd1', user_id: 'user-1', domain: 'firma.com', website_project_id: 'p1', vercel_status: 'configured', dns_status: 'configured', ssl_status: 'ready' },
      { id: 'cd2', user_id: 'user-1', domain: 'baska.com', website_project_id: 'p2', vercel_status: 'configured', dns_status: 'configured', ssl_status: 'ready' },
      { id: 'cd3', user_id: 'user-1', domain: 'dbajans.com.tr', website_project_id: 'p1', vercel_status: 'configured', dns_status: 'configured', ssl_status: 'ready' },
    ],
  }
}

function client() {
  return {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = []
      let patch: Row | null = null
      let deleting = false
      const rows = () => (db.tables[table] ??= [])
      const run = (): { data: Row[] | null; error: Err } => {
        db.calls.push(`${patch ? 'update' : deleting ? 'delete' : 'select'}:${table}`)
        if (db.failOn === table) return { data: null, error: { code: 'XX000', message: 'boom' } }
        const hit = rows().filter((r) => filters.every((f) => f(r)))
        if (patch) hit.forEach((r) => Object.assign(r, patch))
        if (deleting) {
          db.tables[table] = rows().filter((r) => !hit.includes(r))
          if (table === 'projects') {
            // custom_domains.website_project_id is ON DELETE SET NULL.
            for (const d of db.tables.custom_domains ?? []) {
              if (hit.some((p) => p.id === d.website_project_id)) d.website_project_id = null
            }
          }
        }
        return { data: hit, error: null }
      }
      const builder: any = {
        select: () => builder,
        update: (p: Row) => {
          patch = p
          return builder
        },
        delete: () => {
          deleting = true
          return builder
        },
        eq: (col: string, val: unknown) => {
          filters.push((r) => r[col] === val)
          return builder
        },
        is: (col: string, val: unknown) => {
          filters.push((r) => r[col] === val)
          return builder
        },
        maybeSingle: async () => {
          const out = run()
          return { data: out.data?.[0] ?? null, error: out.error }
        },
        then: (resolve: (v: unknown) => void) => resolve(run()),
      }
      return builder
    },
    storage: {
      from(bucket: string) {
        return {
          list: async (prefix: string) => {
            db.calls.push(`list:${bucket}/${prefix}`)
            if (db.storageFailOn === 'list') return { data: null, error: { message: 'storage down' } }
            return { data: (db.storageFiles[`${bucket}/${prefix}`] ?? []).map((name) => ({ name })), error: null }
          },
          remove: async (paths: string[]) => {
            db.calls.push(`remove:${bucket}`)
            for (const key of Object.keys(db.storageFiles)) {
              if (!key.startsWith(`${bucket}/`)) continue
              const dir = key.slice(bucket.length + 1)
              db.storageFiles[key] = db.storageFiles[key].filter((n) => !paths.includes(`${dir}/${n}`))
            }
            return { data: [], error: null }
          },
        }
      },
    },
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/mail/admin-guard', () => ({ isAdminEmail: () => false }))
vi.mock('@/lib/billing', () => ({ getMyCurrentPlan: vi.fn(), getPlanCodeForUser: vi.fn() }))
vi.mock('@/lib/effective-limits', () => ({ getEffectiveSiteLimit: vi.fn(), getEffectiveProductLimit: vi.fn() }))
vi.mock('@/lib/billing-lifecycle', () => ({ isSubscriptionSuspended: vi.fn() }))
vi.mock('@/lib/store-sync', () => ({ syncStoreFromSchema: vi.fn() }))
vi.mock('@/lib/content-attestations', () => ({
  loadAttestedDigests: vi.fn(),
  recordAttestations: vi.fn(),
  selectApproved: vi.fn(),
}))
vi.mock('@/lib/custom-domains/provider', () => ({ getDomainProvider: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.userId ? { id: db.userId, email: 'u@test.dev' } : null } }) },
    ...client(),
  }),
}))
vi.mock('@/lib/custom-domains/vercel', () => ({
  getVercelClient: () => ({
    removeDomain: async (host: string) => {
      db.removedHosts.push(host)
      if (db.hostFailures.has(host)) return { ok: false, code: 'forbidden', message: 'nope', status: 403 }
      return { ok: true, alreadyAbsent: false }
    },
  }),
}))

import { deleteProject } from '@/lib/projects'

let errorLog: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  seed()
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => errorLog.mockRestore())

const siteRows = () => db.tables.projects.filter((p) => p.owner_id === 'user-1').map((p) => p.id)

describe('deleteProject external cleanup', () => {
  it('detaches the site custom domain (apex and www) and resets its hosting status', async () => {
    expect(await deleteProject('p1', 'SİL')).toEqual({ ok: true })
    expect(db.removedHosts.sort()).toEqual(['firma.com', 'www.firma.com'])
    expect(db.tables.custom_domains.find((d) => d.id === 'cd1')).toMatchObject({
      website_project_id: null,
      vercel_status: 'not_configured',
      dns_status: 'pending',
      ssl_status: 'pending',
    })
    expect(errorLog).not.toHaveBeenCalled()
  })

  it('removes only this site product and AI images, not other sites or the owner previews', async () => {
    await deleteProject('p1', 'SİL')
    expect(db.storageFiles['site-images/products/p1']).toEqual([])
    expect(db.storageFiles['site-images/ai-candidates/p1']).toEqual([])
    expect(db.storageFiles['site-images/products/p2']).toEqual(['other-site.png'])
    expect(db.storageFiles['site-images/previews/user-1']).toEqual(['preview.png'])
  })

  it('leaves other sites domains attached and never touches protected platform domains', async () => {
    await deleteProject('p1', 'SİL')
    expect(db.removedHosts).not.toContain('baska.com')
    expect(db.removedHosts.some((h) => h.includes('dbajans'))).toBe(false)
    expect(db.tables.custom_domains.find((d) => d.id === 'cd2')).toMatchObject({ website_project_id: 'p2', vercel_status: 'configured' })
    expect(db.tables.custom_domains.find((d) => d.id === 'cd3')).toMatchObject({ vercel_status: 'configured' })
  })

  it('never contacts the mail provider (mailboxes stay with the kept domain)', async () => {
    await deleteProject('p1', 'SİL')
    expect(db.tables.custom_domains.some((d) => d.id === 'cd1')).toBe(true)
  })

  it('runs cleanup only after the project row is deleted', async () => {
    await deleteProject('p1', 'SİL')
    expect(db.calls.indexOf('delete:projects')).toBeLessThan(db.calls.findIndex((c) => c.startsWith('remove:')))
  })

  it('still succeeds when storage cleanup fails, and logs without ids or personal data', async () => {
    db.storageFailOn = 'list'
    expect(await deleteProject('p1', 'SİL')).toEqual({ ok: true })
    expect(siteRows()).toEqual(['p2'])
    const logged = JSON.stringify(errorLog.mock.calls)
    expect(logged).toContain('[site-delete] cleanup step failed')
    expect(logged).not.toContain('user-1')
    expect(logged).not.toContain('firma.com')
  })

  it('still succeeds when hosting detach fails, and keeps the stage columns as a retry marker', async () => {
    db.hostFailures.add('www.firma.com')
    expect(await deleteProject('p1', 'SİL')).toEqual({ ok: true })
    expect(db.removedHosts.sort()).toEqual(['firma.com', 'www.firma.com'])
    expect(db.tables.custom_domains.find((d) => d.id === 'cd1')).toMatchObject({
      website_project_id: null,
      vercel_status: 'configured',
    })
    expect(JSON.stringify(errorLog.mock.calls)).toContain('hosting-domain')
    expect(db.storageFiles['site-images/products/p1']).toEqual([])
  })

  it('still succeeds when the domain lookup fails', async () => {
    db.failOn = 'custom_domains'
    expect(await deleteProject('p1', 'SİL')).toEqual({ ok: true })
    expect(db.removedHosts).toEqual([])
    expect(db.storageFiles['site-images/products/p1']).toEqual([])
  })

  it('does no cleanup for an unconfirmed, foreign or unauthenticated delete', async () => {
    expect(await deleteProject('p1', 'x')).toEqual({ ok: false, reason: 'CONFIRMATION_REQUIRED' })
    expect(await deleteProject('p9', 'SİL')).toEqual({ ok: false, reason: 'NOT_FOUND' })
    db.userId = null
    expect(await deleteProject('p1', 'SİL')).toEqual({ ok: false, reason: 'UNAUTHENTICATED' })
    expect(db.removedHosts).toEqual([])
    expect(db.calls.some((c) => c.startsWith('remove:'))).toBe(false)
    expect(db.tables.projects).toHaveLength(3)
  })
})
