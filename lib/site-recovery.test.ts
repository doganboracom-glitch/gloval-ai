import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/__fixtures__/fake-db'
import { buildCleanSite } from '@/lib/__fixtures__/sample-site'
import { publishProject, restoreLastValidVersion } from '@/lib/projects'
import { SITE_SECTION_HARD_CAP } from '@/lib/pricing-config'
import { pickLastValidSchema } from '@/lib/website-schema-compat'
import { fallbackWebsite, websiteSchema, type WebsiteSchema } from '@/lib/website-schema'

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

function atCap(site: WebsiteSchema): WebsiteSchema {
  const sections = [...site.sections]
  while (sections.length < SITE_SECTION_HARD_CAP) sections.push(site.sections[0])
  return { ...site, sections: sections.slice(0, SITE_SECTION_HARD_CAP) }
}

function seedProject(schema: unknown) {
  fakeDb.rows('projects').push({
    id: ID,
    owner_id: 'user-1',
    name: 'Luna',
    slug: null,
    published: false,
    published_version_id: null,
    language: 'tr',
    schema_data: schema,
  })
}

const project = () => fakeDb.rows('projects')[0]

beforeEach(() => {
  fakeDb.reset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('a site sitting exactly at the section cap (Luna-shaped)', () => {
  it('publishes and stays schema-valid', async () => {
    const site = atCap(buildCleanSite())
    expect(site.sections).toHaveLength(SITE_SECTION_HARD_CAP)
    seedProject(site)

    const result = await publishProject({ id: ID, schema: site })

    expect(result.ok).toBe(true)
    expect(project().published).toBe(true)
    expect(websiteSchema.safeParse(project().schema_data).success).toBe(true)
  })
})

describe('pickLastValidSchema', () => {
  const valid = fallbackWebsite('kahve', 'tr')

  it('returns the newest readable snapshot, skipping unreadable ones', () => {
    const older = fallbackWebsite('çay', 'tr')
    const picked = pickLastValidSchema([
      { created_at: '2026-01-03T00:00:00Z', schema_data: { broken: true } },
      { created_at: '2026-01-02T00:00:00Z', schema_data: valid },
      { created_at: '2026-01-01T00:00:00Z', schema_data: older },
    ])
    expect(picked).toEqual(valid)
  })

  it('returns null when nothing is readable', () => {
    expect(pickLastValidSchema([{ created_at: '2026-01-01T00:00:00Z', schema_data: 42 }])).toBeNull()
    expect(pickLastValidSchema([])).toBeNull()
  })
})

describe('restoreLastValidVersion', () => {
  it('replaces an unreadable draft with the newest valid snapshot and leaves the published site alone', async () => {
    const good = fallbackWebsite('kahve', 'tr')
    seedProject({ broken: true })
    project().published_version_id = 'v-live'
    fakeDb.rows('project_versions').push(
      { id: 'v-live', project_id: ID, schema_data: good, label: 'published', created_at: '2026-01-02T00:00:00Z' },
      { id: 'v-bad', project_id: ID, schema_data: { broken: true }, label: null, created_at: '2026-01-03T00:00:00Z' },
    )

    const result = await restoreLastValidVersion(ID)

    expect(result).toEqual({ ok: true })
    expect(websiteSchema.safeParse(project().schema_data).success).toBe(true)
    expect(project().published_version_id).toBe('v-live')
  })

  it('reports NO_VALID_VERSION and keeps the draft when no snapshot is readable', async () => {
    seedProject({ broken: true })
    fakeDb.rows('project_versions').push({
      id: 'v-bad',
      project_id: ID,
      schema_data: { broken: true },
      label: null,
      created_at: '2026-01-03T00:00:00Z',
    })

    const result = await restoreLastValidVersion(ID)

    expect(result).toEqual({ ok: false, reason: 'NO_VALID_VERSION' })
    expect(project().schema_data).toEqual({ broken: true })
  })
})
