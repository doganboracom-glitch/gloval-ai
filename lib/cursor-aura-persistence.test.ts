import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/__fixtures__/fake-db'
import { buildCleanSite } from '@/lib/__fixtures__/sample-site'
import { DEFAULT_CURSOR_AURA, type CursorAuraConfig } from '@/lib/cursor-aura'
import { createProject, publishProject, restoreLastValidVersion, saveProjectSchema, snapshotProject } from '@/lib/projects'
import type { WebsiteSchema } from '@/lib/website-schema'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', async () => {
  const { fakeDb } = await import('@/lib/__fixtures__/fake-db')
  return { createClient: async () => fakeDb.client() }
})
vi.mock('@/lib/supabase/admin', async () => {
  const { fakeDb } = await import('@/lib/__fixtures__/fake-db')
  return { createAdminClient: () => fakeDb.client() }
})
vi.mock('@/lib/mail/admin-guard', () => ({ isAdminEmail: () => false }))
vi.mock('@/lib/billing', () => ({
  getMyCurrentPlan: async () => ({ code: 'starter' }),
  getPlanCodeForUser: async () => 'starter',
}))
vi.mock('@/lib/billing-lifecycle', () => ({ isSubscriptionSuspended: async () => false }))
vi.mock('@/lib/effective-limits', () => ({
  getEffectiveSiteLimit: async () => 5,
  getEffectiveProductLimit: async () => null,
}))
vi.mock('@/lib/store-sync', () => ({ syncStoreFromSchema: vi.fn(async () => {}) }))

const ID = 'project-1'
const ADMIN_AURA: CursorAuraConfig = { ...DEFAULT_CURSOR_AURA, enabled: true, colors: ['#22C55E'] }
const OWNER_AURA: CursorAuraConfig = { ...DEFAULT_CURSOR_AURA, enabled: true, colors: ['#EF4444'] }

const clean = (): WebsiteSchema => buildCleanSite()
const withAura = (site: WebsiteSchema, aura: CursorAuraConfig): WebsiteSchema => ({ ...site, effects: { cursorAura: aura } })

function seed(opts: { stored?: WebsiteSchema; extra?: Record<string, unknown> } = {}) {
  fakeDb.rows('projects').push({
    id: ID,
    owner_id: 'user-1',
    name: 'Kahve',
    slug: null,
    published: false,
    published_version_id: null,
    schema_data: opts.stored ?? clean(),
    updated_at: '2026-10-01T10:00:00.000Z',
    ...opts.extra,
  })
}

const project = () => fakeDb.rows('projects')[0]
const draftEffects = () => (project().schema_data as WebsiteSchema).effects
const publishedVersions = () => fakeDb.rows('project_versions').filter((v) => v.label === 'published')

beforeEach(() => {
  fakeDb.reset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('legacy sites without effects', () => {
  it('legacy site without effects: save keeps the draft free of an effects key', async () => {
    seed()
    await saveProjectSchema({ id: ID, schema: clean() })
    expect('effects' in (project().schema_data as object)).toBe(false)
    expect((project().schema_data as WebsiteSchema).sections).toEqual(clean().sections)
  })

  it('legacy site without effects: publish writes a snapshot identical to the draft and without effects', async () => {
    seed()
    const result = await publishProject({ id: ID, schema: clean() })
    expect(result).toMatchObject({ ok: true })
    const [version] = publishedVersions()
    expect('effects' in version.schema_data).toBe(false)
    expect(version.schema_data.sections).toEqual(clean().sections)
    expect(version.schema_data.meta).toEqual(clean().meta)
  })
})

describe('owner cannot change effects', () => {
  it('save: owner payload cannot add effects to a site that has none', async () => {
    seed()
    await saveProjectSchema({ id: ID, schema: withAura(clean(), OWNER_AURA) })
    expect(draftEffects()).toBeUndefined()
  })

  it('save: owner payload cannot replace the stored effects', async () => {
    seed({ stored: withAura(clean(), ADMIN_AURA) })
    await saveProjectSchema({ id: ID, schema: withAura(clean(), OWNER_AURA) })
    expect(draftEffects()).toEqual({ cursorAura: ADMIN_AURA })
  })

  it('save: a payload that omits effects (stale editor copy) does not erase the stored effects', async () => {
    seed({ stored: withAura(clean(), ADMIN_AURA) })
    await saveProjectSchema({ id: ID, schema: clean() })
    expect(draftEffects()).toEqual({ cursorAura: ADMIN_AURA })
  })

  it('snapshot: manual save neither adds nor drops effects in the draft or the version row', async () => {
    seed({ stored: withAura(clean(), ADMIN_AURA) })
    await snapshotProject({ id: ID, schema: withAura(clean(), OWNER_AURA) })
    expect(draftEffects()).toEqual({ cursorAura: ADMIN_AURA })
    const versions = fakeDb.rows('project_versions')
    expect(versions).toHaveLength(1)
    expect(versions[0].schema_data.effects).toEqual({ cursorAura: ADMIN_AURA })

    fakeDb.reset()
    seed()
    await snapshotProject({ id: ID, schema: withAura(clean(), OWNER_AURA) })
    expect(draftEffects()).toBeUndefined()
    expect(fakeDb.rows('project_versions')[0].schema_data.effects).toBeUndefined()
  })

  it('create: a new site cannot be created with owner-supplied effects', async () => {
    const createdId = await createProject({ name: 'Yeni', schema: withAura(clean(), OWNER_AURA) })
    const row = fakeDb.rows('projects').find((p) => p.id === createdId)
    expect(row).toBeDefined()
    expect((row?.schema_data as WebsiteSchema).effects).toBeUndefined()
  })

  it('publish: owner payload cannot inject effects into the published snapshot or draft', async () => {
    seed()
    await publishProject({ id: ID, schema: withAura(clean(), OWNER_AURA) })
    expect(publishedVersions()[0].schema_data.effects).toBeUndefined()
    expect(draftEffects()).toBeUndefined()
  })
})

describe('existing effects survive', () => {
  it('publish: existing effects are kept in the snapshot even when the payload omits or alters them', async () => {
    seed({ stored: withAura(clean(), ADMIN_AURA) })
    await publishProject({ id: ID, schema: clean() })
    expect(publishedVersions()[0].schema_data.effects).toEqual({ cursorAura: ADMIN_AURA })

    await publishProject({ id: ID, schema: withAura(clean(), OWNER_AURA) })
    expect(publishedVersions()).toHaveLength(2)
    for (const version of publishedVersions()) expect(version.schema_data.effects).toEqual({ cursorAura: ADMIN_AURA })
    expect(draftEffects()).toEqual({ cursorAura: ADMIN_AURA })
  })

  it('republish after several edits and saves: effects are preserved', async () => {
    seed({ stored: withAura(clean(), ADMIN_AURA) })
    await publishProject({ id: ID, schema: clean() })
    await saveProjectSchema({ id: ID, schema: clean() })
    await snapshotProject({ id: ID, schema: clean() })
    await publishProject({ id: ID, schema: clean() })
    expect(draftEffects()).toEqual({ cursorAura: ADMIN_AURA })
    const live = publishedVersions().at(-1)
    expect(live?.schema_data.effects).toEqual({ cursorAura: ADMIN_AURA })
  })

  it('restore last valid version: effects of the current draft are preserved, not those of the old snapshot', async () => {
    seed({ stored: withAura(clean(), ADMIN_AURA) })
    fakeDb.rows('project_versions').push({
      id: 'old-version',
      project_id: ID,
      label: 'manual',
      schema_data: withAura(clean(), OWNER_AURA),
      created_at: '2026-09-01T10:00:00.000Z',
    })
    const result = await restoreLastValidVersion(ID)
    expect(result).toEqual({ ok: true })
    expect(draftEffects()).toEqual({ cursorAura: ADMIN_AURA })
  })

  it('restore last valid version: a site that never had effects does not gain them from an old snapshot', async () => {
    seed()
    fakeDb.rows('project_versions').push({
      id: 'old-version',
      project_id: ID,
      label: 'manual',
      schema_data: withAura(clean(), OWNER_AURA),
      created_at: '2026-09-01T10:00:00.000Z',
    })
    expect(await restoreLastValidVersion(ID)).toEqual({ ok: true })
    expect(draftEffects()).toBeUndefined()
  })
})
