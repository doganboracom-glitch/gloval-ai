import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/__fixtures__/fake-db'
import { vetAiSuggestion } from '@/lib/edit-guard'
import { LIST_LIMITS } from '@/lib/list-limits'
import { INVALID_SCHEMA_ERROR, checkPublishable } from '@/lib/publish-gate'
import { publishProject } from '@/lib/projects'
import { applyOperation } from '@/lib/website-edit-operations'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'

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

function siteWithServices() {
  let site = fallbackWebsite('kahve atölyesi', 'tr')
  let index = site.sections.findIndex((s) => s.type === 'services')
  if (index < 0) {
    site = applyOperation(site, { op: 'addSection', sectionType: 'services' })
    index = site.sections.findIndex((s) => s.type === 'services')
  }
  return { site, index }
}

function withItems(site: WebsiteSchema, index: number, count: number): WebsiteSchema {
  const copy = structuredClone(site) as WebsiteSchema
  const section = copy.sections[index] as unknown as { items: unknown[] }
  const template = section.items[0]
  section.items = Array.from({ length: count }, () => structuredClone(template))
  return copy
}

describe('AI suggestions go through the edit guard', () => {
  it('accepts a valid suggestion', () => {
    const { site } = siteWithServices()
    const verdict = vetAiSuggestion(site, site)
    expect(verdict.ok).toBe(true)
  })

  it('rejects an AI answer above the list maximum and names the limit', () => {
    const { site, index } = siteWithServices()
    const tooMany = withItems(site, index, LIST_LIMITS.services.max + 1)
    const verdict = vetAiSuggestion(site, tooMany)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.message).toContain(String(LIST_LIMITS.services.max))
      expect(verdict.message).toContain('değişiklik yapılmadı')
    }
  })

  it('rejects an AI answer below the list minimum', () => {
    const { site, index } = siteWithServices()
    const tooFew = withItems(site, index, 0)
    const verdict = vetAiSuggestion(site, tooFew)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.message).toContain(String(LIST_LIMITS.services.min))
  })

  it('rejects a structurally broken answer with a generic message and no field values', () => {
    const { site } = siteWithServices()
    const verdict = vetAiSuggestion(site, { meta: 'SECRET-VALUE', sections: 'nope' })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) {
      expect(verdict.message).not.toContain('SECRET-VALUE')
      expect(verdict.message).toContain('uygulanmadı')
    }
    expect(vetAiSuggestion(site, null).ok).toBe(false)
  })
})

describe('publish gate', () => {
  beforeEach(() => {
    fakeDb.reset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  function seed(draft: WebsiteSchema, extra: Record<string, unknown> = {}) {
    fakeDb.rows('projects').push({
      id: ID,
      owner_id: 'user-1',
      name: 'Kahve',
      slug: null,
      published: false,
      published_version_id: null,
      schema_data: draft,
      ...extra,
    })
  }

  it('checkPublishable passes valid and refuses invalid, reporting paths only', () => {
    const { site, index } = siteWithServices()
    expect(checkPublishable(site).ok).toBe(true)
    const gate = checkPublishable(withItems(site, index, LIST_LIMITS.services.max + 1))
    expect(gate.ok).toBe(false)
    if (!gate.ok) expect(gate.paths.join()).toContain(`sections.${index}`)
  })

  it('Yayınla: an invalid schema is refused and nothing is persisted', async () => {
    const { site, index } = siteWithServices()
    seed(site)
    const result = await publishProject({ id: ID, schema: withItems(site, index, LIST_LIMITS.services.max + 1) })
    expect(result).toMatchObject({ ok: false, reason: INVALID_SCHEMA_ERROR })
    const row = fakeDb.rows('projects')[0]
    expect(row.published).toBe(false)
    expect(row.slug).toBeNull()
    expect(row.schema_data).toEqual(site)
    expect(fakeDb.rows('project_versions')).toEqual([])
  })

  it('Yeniden yayınla: an invalid schema leaves the live version untouched', async () => {
    const { site, index } = siteWithServices()
    seed(site, { slug: 'kahve', published: true, published_version_id: 'v-live' })
    fakeDb.rows('project_versions').push({
      id: 'v-live',
      project_id: ID,
      label: 'published',
      schema_data: site,
      created_at: new Date().toISOString(),
    })
    const result = await publishProject({ id: ID, schema: withItems(site, index, 0) })
    expect(result).toMatchObject({ ok: false, reason: INVALID_SCHEMA_ERROR })
    const row = fakeDb.rows('projects')[0]
    expect(row.published_version_id).toBe('v-live')
    expect(row.schema_data).toEqual(site)
    expect(fakeDb.rows('project_versions')).toHaveLength(1)
  })
})
