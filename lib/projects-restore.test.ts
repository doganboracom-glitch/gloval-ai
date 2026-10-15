import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeClient, type Op, type Row, type Tables } from '@/lib/__fixtures__/fake-supabase'
import { contentHash } from '@/lib/project-backups-core'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'

const OWNER = 'owner-1'
const STRANGER = 'stranger-1'
const PROJECT = 'project-1'

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  log: [] as unknown[],
  userId: 'owner-1',
  plans: {} as Record<string, string>,
  pageLimit: null as null | number,
  rateAllowed: true,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/mail/admin-guard', () => ({ isAdminEmail: () => false }))
vi.mock('@/lib/billing', () => ({
  getMyCurrentPlan: vi.fn(),
  getPlanCodeForUser: async (id: string) => state.plans[id] ?? 'free',
}))
vi.mock('@/lib/effective-limits', () => ({ getEffectiveSiteLimit: vi.fn(), getEffectiveProductLimit: vi.fn() }))
vi.mock('@/lib/page-limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/page-limits')>()
  return { ...actual, pageLimitForPlan: (plan: string | null | undefined) => state.pageLimit ?? actual.pageLimitForPlan(plan) }
})
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => (state.rateAllowed ? { allowed: true, retryAfterMs: 0 } : { allowed: false, retryAfterMs: 90_000 }),
}))
vi.mock('@/lib/billing-lifecycle', () => ({ isSubscriptionSuspended: vi.fn() }))
vi.mock('@/lib/store-sync', () => ({ syncStoreFromSchema: vi.fn() }))
vi.mock('@/lib/content-attestations', () => ({
  loadAttestedDigests: vi.fn(),
  recordAttestations: vi.fn(),
  selectApproved: vi.fn(),
}))
vi.mock('@/lib/custom-domains/provider', () => ({ getDomainProvider: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeClient } = await import('@/lib/__fixtures__/fake-supabase')
  return {
    createAdminClient: () =>
      createFakeClient(state.tables as Tables, {
        log: state.log as Op[],
        uniqueKey: (table, row) =>
          table === 'project_backups' && row.kind !== 'pre_restore'
            ? `${row.project_id}:${row.kind}:${String(row.created_at).slice(0, 10)}`
            : null,
      }),
  }
})
vi.mock('@/lib/supabase/server', async () => {
  const { createFakeClient } = await import('@/lib/__fixtures__/fake-supabase')
  return {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: state.userId, email: `${state.userId}@test.dev` } } }) },
      ...createFakeClient(state.tables as Tables, {
        log: state.log as Op[],
        // RLS: a session only sees projects it owns, and backups of those projects.
        visible: (table, row) => {
          if (table === 'projects') return row.owner_id === state.userId
          if (table === 'project_backups') {
            const project = (state.tables.projects ?? []).find((p) => p.id === row.project_id)
            return project?.owner_id === state.userId
          }
          return true
        },
      }),
    }),
  }
})

import { listProjectBackups, listProjectVersions, restoreProjectBackup } from '@/lib/projects'

function siteWithPages(count: number, title = 'Site'): WebsiteSchema {
  const base = fallbackWebsite(title, 'tr')
  const pages = Array.from({ length: count }, (_, i) => ({
    slug: i === 0 ? 'home' : `sayfa-${i}`,
    title: i === 0 ? 'Ana Sayfa' : `Sayfa ${i}`,
    ...(i === 0 ? { isHome: true } : {}),
  }))
  return { ...base, pages: pages as WebsiteSchema['pages'] }
}

function seed(overrides: { current?: WebsiteSchema; backup?: WebsiteSchema; plan?: string } = {}) {
  const current = overrides.current ?? siteWithPages(3, 'Mevcut taslak')
  const backup = overrides.backup ?? siteWithPages(3, 'Yedek içerik')
  state.plans = { [OWNER]: overrides.plan ?? 'pro' }
  state.tables = {
    projects: [
      {
        id: PROJECT,
        owner_id: OWNER,
        schema_data: current,
        updated_at: '2026-10-01T10:00:00.000Z',
        published_version_id: 'version-live',
        published: true,
        slug: 'kahve',
        project_type: 'corporate',
      },
    ],
    project_versions: [{ id: 'version-live', project_id: PROJECT, label: 'published', schema_data: siteWithPages(2, 'Yayında') }],
    project_backups: [
      { id: 'backup-1', project_id: PROJECT, kind: 'daily', schema_data: backup, created_at: '2026-09-30T03:00:00.000Z' },
    ],
  }
  state.log = []
  state.userId = OWNER
  return { current, backup }
}

const projectRow = (): Row => (state.tables.projects as Row[])[0]

describe('restoreProjectBackup', () => {
  beforeEach(() => {
    seed()
    state.pageLimit = null
    state.rateAllowed = true
  })

  it('writes the pre_restore backup BEFORE overwriting the draft', async () => {
    const { current } = seed()
    const result = await restoreProjectBackup({ projectId: PROJECT, backupId: 'backup-1' })
    expect(result).toEqual({ ok: true })

    const ops = state.log as Op[]
    const preRestore = ops.findIndex((o) => o.table === 'project_backups' && o.op === 'insert')
    const draftWrite = ops.findIndex((o) => o.table === 'projects' && o.op === 'update')
    expect(preRestore).toBeGreaterThanOrEqual(0)
    expect(draftWrite).toBeGreaterThan(preRestore)

    const saved = (state.tables.project_backups as Row[]).find((b) => b.kind === 'pre_restore')
    expect(saved?.content_hash).toBe(contentHash(current))
    expect((projectRow().schema_data as WebsiteSchema).meta).toEqual(siteWithPages(3, 'Yedek içerik').meta)
  })

  it('never touches the published version, its pointer, or publish state', async () => {
    seed()
    await restoreProjectBackup({ projectId: PROJECT, backupId: 'backup-1' })

    const ops = state.log as Op[]
    expect(ops.filter((o) => o.table === 'project_versions' && o.op !== 'select')).toEqual([])
    const draftPatches = ops.filter((o) => o.table === 'projects' && o.op === 'update').map((o) => Object.keys(o.detail as object))
    for (const keys of draftPatches) {
      expect(keys.sort()).toEqual(expect.not.arrayContaining(['published_version_id', 'published', 'published_at', 'slug']))
    }
    expect(projectRow().published_version_id).toBe('version-live')
    expect(projectRow().published).toBe(true)
    expect((state.tables.project_versions as Row[]).map((v) => v.id)).toEqual(['version-live'])
  })

  it('validates the stored backup with websiteSchema and refuses an invalid one without writing', async () => {
    seed()
    ;(state.tables.project_backups as Row[])[0].schema_data = { not: 'a website' }
    const result = await restoreProjectBackup({ projectId: PROJECT, backupId: 'backup-1' })
    expect(result).toEqual({ ok: false, reason: 'INVALID_BACKUP' })
    expect((state.log as Op[]).filter((o) => o.op !== 'select')).toEqual([])
  })

  it('refuses a restore that would grow the site past the page limit, and writes nothing', async () => {
    seed({ current: siteWithPages(2), backup: siteWithPages(7) })
    state.pageLimit = 5
    const result = await restoreProjectBackup({ projectId: PROJECT, backupId: 'backup-1' })
    expect(result).toMatchObject({ ok: false, reason: 'PAGE_LIMIT_REACHED', limit: 5 })
    expect((state.log as Op[]).filter((o) => o.op !== 'select')).toEqual([])
  })

  it('still allows a restore that adds no pages when the site is already over the limit', async () => {
    seed({ current: siteWithPages(7), backup: siteWithPages(6) })
    state.pageLimit = 5
    const result = await restoreProjectBackup({ projectId: PROJECT, backupId: 'backup-1' })
    expect(result).toEqual({ ok: true })
  })

  it('rejects a user who does not own the project and writes nothing', async () => {
    seed()
    state.userId = STRANGER
    state.plans[STRANGER] = 'pro'
    await expect(restoreProjectBackup({ projectId: PROJECT, backupId: 'backup-1' })).rejects.toThrow('NOT_FOUND')
    expect((state.log as Op[]).filter((o) => o.op !== 'select')).toEqual([])
    expect(projectRow().schema_data).toEqual(siteWithPages(3, 'Mevcut taslak'))
  })

  it('does not let another owner list this project\'s backups', async () => {
    seed()
    state.userId = STRANGER
    state.plans[STRANGER] = 'pro'
    await expect(listProjectBackups(PROJECT)).rejects.toThrow('NOT_FOUND')
  })

  it('aborts when the editor\'s draft is older than the stored draft (updated_at conflict)', async () => {
    seed()
    const result = await restoreProjectBackup({
      projectId: PROJECT,
      backupId: 'backup-1',
      expectedUpdatedAt: '2026-10-01T09:00:00.000Z',
    })
    expect(result).toEqual({ ok: false, reason: 'DRAFT_CHANGED' })
    expect((state.log as Op[]).filter((o) => o.op !== 'select')).toEqual([])
    expect(projectRow().updated_at).toBe('2026-10-01T10:00:00.000Z')
  })

  it('aborts and keeps the newer edit when the draft changes while the pre_restore backup is being written', async () => {
    seed()
    const tables = state.tables
    const original = tables.project_backups as Row[]
    // Simulate a concurrent autosave landing right after the draft was read for the pre_restore backup.
    const push = original.push.bind(original)
    original.push = (...rows: Row[]) => {
      if (rows.some((row) => row.kind === 'pre_restore')) {
        projectRow().schema_data = siteWithPages(3, 'Eşzamanlı düzenleme')
        projectRow().updated_at = '2026-10-01T10:00:05.000Z'
      }
      return push(...rows)
    }
    const result = await restoreProjectBackup({
      projectId: PROJECT,
      backupId: 'backup-1',
      expectedUpdatedAt: '2026-10-01T10:00:00.000Z',
    })
    expect(result).toEqual({ ok: false, reason: 'DRAFT_CHANGED' })
    expect((projectRow().schema_data as WebsiteSchema).meta).toEqual(siteWithPages(3, 'Eşzamanlı düzenleme').meta)
  })

  it('rate limits restores before reading or writing anything', async () => {
    seed()
    state.rateAllowed = false
    const result = await restoreProjectBackup({ projectId: PROJECT, backupId: 'backup-1' })
    expect(result).toEqual({ ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: 90 })
    expect((state.log as Op[]).filter((o) => o.op !== 'select')).toEqual([])
  })

  it('restores with a matching updated_at', async () => {
    seed()
    const result = await restoreProjectBackup({
      projectId: PROJECT,
      backupId: 'backup-1',
      expectedUpdatedAt: '2026-10-01T10:00:00.000Z',
    })
    expect(result).toEqual({ ok: true })
  })

  it('does not restore when the pre_restore backup cannot be written', async () => {
    seed()
    ;(state.tables.project_backups as Row[]).push = () => {
      throw new Error('disk full')
    }
    const result = await restoreProjectBackup({ projectId: PROJECT, backupId: 'backup-1' })
    expect(result).toEqual({ ok: false, reason: 'PRE_RESTORE_FAILED' })
    expect((projectRow().schema_data as WebsiteSchema).meta).toEqual(siteWithPages(3, 'Mevcut taslak').meta)
  })
})

describe('server gate for version history and backups', () => {
  it.each(['free', 'starter'])('refuses the %s plan on every history entry point and writes nothing', async (plan) => {
    seed({ plan })
    await expect(listProjectVersions(PROJECT)).rejects.toThrow('HISTORY_PLAN_REQUIRED')
    await expect(listProjectBackups(PROJECT)).rejects.toThrow('HISTORY_PLAN_REQUIRED')
    expect(await restoreProjectBackup({ projectId: PROJECT, backupId: 'backup-1' })).toEqual({
      ok: false,
      reason: 'HISTORY_PLAN_REQUIRED',
    })
    expect((state.log as Op[]).filter((o) => o.op !== 'select')).toEqual([])
    expect(projectRow().schema_data).toEqual(siteWithPages(3, 'Mevcut taslak'))
  })

  it.each(['pro', 'ecommerce'])('allows the %s plan', async (plan) => {
    seed({ plan })
    await expect(listProjectBackups(PROJECT)).resolves.toHaveLength(1)
  })
})
