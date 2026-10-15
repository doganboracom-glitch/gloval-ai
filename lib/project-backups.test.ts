import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeClient, type Op, type Row, type Tables } from '@/lib/__fixtures__/fake-supabase'
import { BACKUP_RETENTION, VERSION_PRUNE_DAYS, contentHash } from '@/lib/project-backups-core'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  log: [] as unknown[],
  clock: '2026-10-15T03:00:00.000Z',
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', async () => {
  const { createFakeClient } = await import('@/lib/__fixtures__/fake-supabase')
  return {
    createAdminClient: () =>
      createFakeClient(state.tables as Tables, {
        log: state.log as Op[],
        now: () => state.clock,
        uniqueKey: (table, row) =>
          table === 'project_backups' && row.kind !== 'pre_restore'
            ? `${row.project_id}:${row.kind}:${String(row.created_at).slice(0, 10)}`
            : null,
      }),
  }
})

import { backupIfDue, recordBackup, runBackupSweep } from '@/lib/project-backups'

const site = (title: string): WebsiteSchema => ({
  ...fallbackWebsite('kahve dükkanı', 'tr'),
  pages: [{ slug: 'home', title, isHome: true }] as WebsiteSchema['pages'],
})
const backups = () => (state.tables.project_backups ?? []) as Row[]
const mutations = () => (state.log as Op[]).filter((o) => o.op !== 'select')
const DAY = 24 * 60 * 60 * 1000

function day(n: number): string {
  return new Date(Date.parse('2026-09-01T03:00:00.000Z') + n * DAY).toISOString()
}

beforeEach(() => {
  state.tables = { project_backups: [], projects: [], project_versions: [], billing_subscriptions: [] }
  state.log = []
  state.clock = '2026-10-15T03:00:00.000Z'
  vi.unstubAllEnvs()
})
afterEach(() => vi.unstubAllEnvs())

describe('recordBackup idempotency and hash dedupe', () => {
  it('skips a daily backup whose content equals the latest daily backup', async () => {
    expect(await recordBackup({ projectId: 'p1', kind: 'daily', schema: site('A') })).toBe('created')
    state.clock = '2026-10-16T03:00:00.000Z'
    expect(await recordBackup({ projectId: 'p1', kind: 'daily', schema: site('A') })).toBe('unchanged')
    expect(backups()).toHaveLength(1)
    expect(backups()[0].content_hash).toBe(contentHash(site('A')))
  })

  it('writes a new daily backup when the content changed', async () => {
    await recordBackup({ projectId: 'p1', kind: 'daily', schema: site('A') })
    state.clock = '2026-10-16T03:00:00.000Z'
    expect(await recordBackup({ projectId: 'p1', kind: 'daily', schema: site('B') })).toBe('created')
    expect(backups()).toHaveLength(2)
  })

  it('reports a second different write on the same UTC day as duplicate (unique index), not an error', async () => {
    await recordBackup({ projectId: 'p1', kind: 'daily', schema: site('A') })
    expect(await recordBackup({ projectId: 'p1', kind: 'daily', schema: site('B') })).toBe('duplicate')
    expect(backups()).toHaveLength(1)
  })

  it('keeps dedupe per project and per kind', async () => {
    await recordBackup({ projectId: 'p1', kind: 'daily', schema: site('A') })
    expect(await recordBackup({ projectId: 'p2', kind: 'daily', schema: site('A') })).toBe('created')
    expect(await recordBackup({ projectId: 'p1', kind: 'weekly', schema: site('A') })).toBe('created')
  })

  it('pre_restore always writes, even for identical content on the same day', async () => {
    expect(await recordBackup({ projectId: 'p1', kind: 'pre_restore', schema: site('A') })).toBe('created')
    expect(await recordBackup({ projectId: 'p1', kind: 'pre_restore', schema: site('A') })).toBe('created')
    expect(backups().filter((b) => b.kind === 'pre_restore')).toHaveLength(2)
  })

  it('backupIfDue is idempotent within the cadence window', async () => {
    const now = new Date('2026-10-15T09:00:00.000Z')
    expect(await backupIfDue({ projectId: 'p1', planCode: 'pro', schema: site('A'), now })).toBe('created')
    expect(await backupIfDue({ projectId: 'p1', planCode: 'pro', schema: site('A'), now })).toBe('skipped')
    expect(backups()).toHaveLength(1)
  })

  it('backupIfDue never backs up a Free site or an unknown plan code', async () => {
    expect(await backupIfDue({ projectId: 'p1', planCode: 'free', schema: site('A') })).toBe('skipped')
    expect(await backupIfDue({ projectId: 'p1', planCode: null, schema: site('A') })).toBe('skipped')
    expect(await backupIfDue({ projectId: 'p1', planCode: 'pro_addon_x', schema: site('A') })).toBe('skipped')
    expect(backups()).toHaveLength(0)
  })
})

describe('retention per kind', () => {
  it('keeps the newest 14 daily backups', async () => {
    for (let i = 0; i < 20; i++) {
      state.clock = day(i)
      await recordBackup({ projectId: 'p1', kind: 'daily', schema: site(`d${i}`) })
    }
    const kept = backups().filter((b) => b.kind === 'daily')
    expect(BACKUP_RETENTION.daily).toBe(14)
    expect(kept).toHaveLength(14)
    expect(kept.map((b) => b.created_at).sort()[0]).toBe(day(6))
  })

  it('keeps the newest 4 weekly backups', async () => {
    for (let i = 0; i < 9; i++) {
      state.clock = day(i * 7)
      await recordBackup({ projectId: 'p1', kind: 'weekly', schema: site(`w${i}`) })
    }
    expect(BACKUP_RETENTION.weekly).toBe(4)
    expect(backups().filter((b) => b.kind === 'weekly')).toHaveLength(4)
  })

  it('keeps the newest 5 pre_restore backups, independent of daily/weekly pools', async () => {
    await recordBackup({ projectId: 'p1', kind: 'daily', schema: site('keep-daily') })
    for (let i = 0; i < 8; i++) {
      state.clock = day(i)
      await recordBackup({ projectId: 'p1', kind: 'pre_restore', schema: site(`r${i}`) })
    }
    expect(BACKUP_RETENTION.pre_restore).toBe(5)
    expect(backups().filter((b) => b.kind === 'pre_restore')).toHaveLength(5)
    expect(backups().filter((b) => b.kind === 'daily')).toHaveLength(1)
  })

  it('trims per project only', async () => {
    for (let i = 0; i < 16; i++) {
      state.clock = day(i)
      await recordBackup({ projectId: 'p1', kind: 'daily', schema: site(`a${i}`) })
    }
    await recordBackup({ projectId: 'p2', kind: 'daily', schema: site('other') })
    expect(backups().filter((b) => b.project_id === 'p2')).toHaveLength(1)
  })
})

function seedPrune() {
  const old = '2026-08-01T00:00:00.000Z'
  const recent = '2026-10-10T00:00:00.000Z'
  state.tables.projects = [
    { id: 'free-proj', owner_id: 'free-owner', published_version_id: 'v-free-live', updated_at: old },
    { id: 'pro-proj', owner_id: 'pro-owner', published_version_id: null, updated_at: old },
  ]
  state.tables.project_versions = [
    { id: 'v-free-old', project_id: 'free-proj', label: null, created_at: old },
    { id: 'v-free-old-named', project_id: 'free-proj', label: 'Manuel', created_at: old },
    { id: 'v-free-live', project_id: 'free-proj', label: null, created_at: old },
    { id: 'v-free-published-label', project_id: 'free-proj', label: 'published', created_at: old },
    { id: 'v-free-recent', project_id: 'free-proj', label: null, created_at: recent },
    { id: 'v-pro-old', project_id: 'pro-proj', label: null, created_at: old },
  ]
  state.tables.billing_subscriptions = [
    { id: 's1', user_id: 'pro-owner', status: 'active', billing_plans: { code: 'pro' } },
  ]
}

const versionIds = () => (state.tables.project_versions as Row[]).map((v) => v.id)
const sweep = (deadlineMs = Date.now() + 60_000) => runBackupSweep({ deadlineMs, now: new Date('2026-10-15T03:00:00.000Z') })

describe('version prune flag', () => {
  it('has a 30 day cutoff', () => {
    expect(VERSION_PRUNE_DAYS).toBe(30)
  })

  it.each([undefined, '', 'false', 'TRUE', '1', 'yes', ' true'])('deletes nothing and only counts when the flag is %j', async (flag) => {
    if (flag !== undefined) vi.stubEnv('BACKUP_PRUNE_ENABLED', flag)
    seedPrune()
    const before = versionIds()
    const summary = await sweep()
    expect(summary.pruneEnabled).toBe(false)
    expect(summary.versionsPruned).toBe(0)
    expect(summary.versionsWouldPrune).toBe(2)
    expect(versionIds()).toEqual(before)
    expect(mutations().filter((o) => o.table === 'project_versions')).toEqual([])
  })

  it('with the flag exactly "true" deletes only stale, non-published, non-protected rows', async () => {
    vi.stubEnv('BACKUP_PRUNE_ENABLED', 'true')
    seedPrune()
    const summary = await sweep()
    expect(summary.pruneEnabled).toBe(true)
    expect(summary.versionsPruned).toBe(2)
    expect(versionIds().sort()).toEqual(['v-free-live', 'v-free-published-label', 'v-free-recent', 'v-pro-old'].sort())
  })

  it('with the flag on never deletes a published version (by pointer or by label) even when stale', async () => {
    vi.stubEnv('BACKUP_PRUNE_ENABLED', 'true')
    seedPrune()
    await sweep()
    expect(versionIds()).toContain('v-free-live')
    expect(versionIds()).toContain('v-free-published-label')
  })

  it('with the flag on keeps everything for owners of a plan that keeps history', async () => {
    vi.stubEnv('BACKUP_PRUNE_ENABLED', 'true')
    seedPrune()
    await sweep()
    expect(versionIds()).toContain('v-pro-old')
  })

  it('deletes expired backups regardless of the prune flag', async () => {
    seedPrune()
    state.tables.project_backups = [
      { id: 'b-old', project_id: 'pro-proj', kind: 'daily', expires_at: '2026-09-01T00:00:00.000Z' },
      { id: 'b-fresh', project_id: 'pro-proj', kind: 'daily', expires_at: '2027-01-01T00:00:00.000Z' },
    ]
    const summary = await sweep()
    expect(summary.expiredDeleted).toBe(1)
    expect(backups().map((b) => b.id)).toEqual(['b-fresh'])
  })
})

describe('cron time budget', () => {
  function seedOwners(count: number) {
    state.tables.billing_subscriptions = Array.from({ length: count }, (_, i) => ({
      id: `s${String(i).padStart(3, '0')}`,
      user_id: `u${i}`,
      status: 'active',
      billing_plans: { code: 'pro' },
    }))
    state.tables.projects = Array.from({ length: count }, (_, i) => ({
      id: `p${i}`,
      owner_id: `u${i}`,
      updated_at: '2026-10-14T00:00:00.000Z',
      schema_data: site(`Site ${i}`),
    }))
  }

  it('stops immediately without backing anything up when the deadline has passed', async () => {
    seedOwners(5)
    const summary = await sweep(Date.now() - 1)
    expect(summary.stoppedByBudget).toBe(true)
    expect(summary.created).toBe(0)
    expect(backups()).toHaveLength(0)
  })

  it('stops mid-run at the deadline and the next run finishes the remaining projects', async () => {
    seedOwners(6)
    let calls = 0
    const realNow = Date.now
    const deadline = 1_000_000
    // Budget allows exactly three project iterations, then reports the deadline as reached.
    vi.spyOn(Date, 'now').mockImplementation(() => (calls++ < 5 ? deadline - 1 : deadline))
    const first = await sweep(deadline)
    vi.restoreAllMocks()
    Date.now = realNow

    expect(first.stoppedByBudget).toBe(true)
    expect(first.created).toBeGreaterThan(0)
    expect(first.created).toBeLessThan(6)

    const second = await sweep()
    expect(second.stoppedByBudget).toBe(false)
    expect(backups().filter((b) => b.kind === 'daily')).toHaveLength(6)
  })

  it('is idempotent: a second run the same day creates nothing new', async () => {
    seedOwners(3)
    await sweep()
    const second = await sweep()
    expect(second.created).toBe(0)
    expect(backups()).toHaveLength(3)
  })

  it('never backs up Free owners or owners with a non-exact plan code', async () => {
    seedOwners(2)
    state.tables.billing_subscriptions = [
      { id: 's1', user_id: 'u0', status: 'active', billing_plans: { code: 'free' } },
      { id: 's2', user_id: 'u1', status: 'active', billing_plans: { code: 'pro_addon_domains' } },
    ]
    const summary = await sweep()
    expect(summary.created).toBe(0)
    expect(backups()).toHaveLength(0)
  })
})
