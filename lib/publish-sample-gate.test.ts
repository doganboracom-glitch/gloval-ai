import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeDb } from '@/lib/__fixtures__/fake-db'
import { buildCleanSite, buildSampleSections, buildSampleSite } from '@/lib/__fixtures__/sample-site'
import { getPublishedSite, publishProject } from '@/lib/projects'
import { ensurePageIds } from '@/lib/website-schema-compat'
import {
  CONTACT_ATTESTATION_VERSION,
  SAMPLE_CONTENT_ERROR,
  collectSampleFindings,
  hideSampleSections,
  removeOrHideSampleItem,
  stripSampleContent,
} from '@/lib/sample-content'
import { fallbackWebsite, websiteSchema, type Section, type WebsiteSchema } from '@/lib/website-schema'

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
const DRAFT = fallbackWebsite('kahve dükkanı', 'tr')

function seedProject(extra: Record<string, unknown> = {}) {
  fakeDb.rows('projects').push({
    id: ID,
    owner_id: 'user-1',
    name: 'Kahve',
    slug: null,
    published: false,
    published_version_id: null,
    schema_data: DRAFT,
    ...extra,
  })
}

const project = () => fakeDb.rows('projects')[0]
const ids = (site: WebsiteSchema) => collectSampleFindings(site).flatMap((s) => s.items.map((i) => i.id))
// Placeholder testimonials can never be approved: the owner has to write real ones (clearing the flag) or remove them.
const withOwnerTestimonials = (site: WebsiteSchema): WebsiteSchema => ({
  ...site,
  sections: site.sections.map((s) =>
    s.type === 'testimonials'
      ? ({ ...s, sample: undefined, items: s.items.map((i) => ({ ...i, sample: undefined })) } as Section)
      : s,
  ),
})
const buildPublishableSite = (sections?: Section[]) => withOwnerTestimonials(buildSampleSite(sections))
const published = () => fakeDb.rows('project_versions').filter((v) => v.label === 'published')

beforeEach(() => {
  fakeDb.reset()
  seedProject()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('publishProject sample-content gate', () => {
  it('refuses to publish unapproved sample content and persists nothing', async () => {
    const result = await publishProject({ id: ID, schema: buildSampleSite() })

    expect(result.ok).toBe(false)
    if (result.ok || result.reason !== SAMPLE_CONTENT_ERROR) throw new Error('expected SAMPLE_CONTENT')
    expect(result.sections.map((s) => s.sectionType)).toEqual(['hero', 'testimonials', 'stats', 'pricing', 'products'])
    expect(project().published).toBe(false)
    expect(project().slug).toBeNull()
    expect(project().schema_data).toEqual(DRAFT)
    expect(fakeDb.rows('project_versions')).toEqual([])
    expect(fakeDb.rows('content_attestations')).toEqual([])
  })

  it('cannot be skipped by the autopublish entry or an empty approval list', async () => {
    // ?autopublish=1 and every other client path reach the server through
    // publishProject with whatever approvals the client sends — none here.
    for (const approvals of [undefined, [], ['made-up-digest']]) {
      const result = await publishProject({ id: ID, schema: buildSampleSite(), approvals })
      expect(result).toMatchObject({ ok: false, reason: SAMPLE_CONTENT_ERROR })
    }
    expect(published()).toEqual([])
    expect(project().published).toBe(false)
  })

  it('stays blocked when only part of the content is approved, and writes no attestation', async () => {
    const site = buildSampleSite()
    const result = await publishProject({ id: ID, schema: site, approvals: ids(site).slice(0, 2) })
    expect(result).toMatchObject({ ok: false, reason: SAMPLE_CONTENT_ERROR })
    expect(fakeDb.rows('content_attestations')).toEqual([])
    expect(published()).toEqual([])
  })

  it('lists contact placeholders and publishes them empty once acknowledged', async () => {
    const base = buildCleanSite()
    const site = {
      ...base,
      sections: [
        ...base.sections.filter((s) => s.type !== 'contact'),
        { type: 'contact', title: 'İletişim', phone: '+90 532 111 22 33', sample: true, sampleFields: ['phone'] },
      ],
    } as WebsiteSchema

    const refused = await publishProject({ id: ID, schema: site })
    expect(refused).toMatchObject({ ok: false, reason: SAMPLE_CONTENT_ERROR })
    if (refused.ok || refused.reason !== SAMPLE_CONTENT_ERROR) throw new Error('expected SAMPLE_CONTENT')
    expect(refused.sections.map((s) => s.sectionType)).toEqual(['contact'])
    expect(published()).toEqual([])

    const accepted = await publishProject({ id: ID, schema: site, approvals: ids(site) })
    expect(accepted).toMatchObject({ ok: true })
    expect(fakeDb.rows('content_attestations')).toEqual([])
    expect(JSON.stringify(published()[0].schema_data)).not.toContain('532 111')
  })

  it('publishes once every item is approved and stores flag-free content plus attestations', async () => {
    const site = buildPublishableSite()
    const result = await publishProject({ id: ID, schema: site, approvals: ids(site) })

    expect(result).toMatchObject({ ok: true })
    expect(project().published).toBe(true)
    expect(fakeDb.rows('content_attestations')).toHaveLength(ids(site).length)
    const [version] = published()
    expect(collectSampleFindings(version.schema_data)).toEqual([])
    expect(JSON.stringify(version.schema_data)).not.toContain('"sample":true')
    // approved content is the owner's: it is still there
    expect(JSON.stringify(version.schema_data)).toContain('Ayşe Yılmaz')
  })

  it('does not double-record attestations on a repeat publish and needs no re-approval', async () => {
    const site = buildPublishableSite()
    await publishProject({ id: ID, schema: site, approvals: ids(site) })
    const stored = fakeDb.rows('content_attestations').length

    const again = await publishProject({ id: ID, schema: site })
    expect(again).toMatchObject({ ok: true })
    expect(fakeDb.rows('content_attestations')).toHaveLength(stored)
  })

  it('asks again when approved content is edited afterwards', async () => {
    const site = buildPublishableSite()
    await publishProject({ id: ID, schema: site, approvals: ids(site) })

    const edited = buildPublishableSite(
      buildSampleSections().map((s) =>
        s.type === 'stats' ? { ...s, items: s.items.map((i, n) => (n === 0 ? { ...i, value: '99 yıl' } : i)) } : s,
      ) as Section[],
    )
    const result = await publishProject({ id: ID, schema: edited })
    expect(result).toMatchObject({ ok: false, reason: SAMPLE_CONTENT_ERROR })
    if (result.ok || result.reason !== SAMPLE_CONTENT_ERROR) throw new Error('expected SAMPLE_CONTENT')
    expect(result.sections.map((s) => s.sectionType)).toEqual(['stats'])
  })

  it('fails closed when the approval cannot be written: nothing is saved or published', async () => {
    fakeDb.attestationWriteError = 'insert failed'
    const site = buildPublishableSite()
    const result = await publishProject({ id: ID, schema: site, approvals: ids(site) })

    expect(result).toMatchObject({ ok: false, reason: SAMPLE_CONTENT_ERROR, attestationFailed: true })
    expect(project().published).toBe(false)
    expect(published()).toEqual([])
    expect(project().schema_data).toEqual(DRAFT)
  })

  it('fails closed when stored attestations cannot be read', async () => {
    const site = buildSampleSite()
    await publishProject({ id: ID, schema: site, approvals: ids(site) })
    fakeDb.attestationReadError = true
    expect(await publishProject({ id: ID, schema: site })).toMatchObject({ ok: false, reason: SAMPLE_CONTENT_ERROR })
  })

  it('"hide and publish" works without any approval and without attestation writes', async () => {
    const site = buildSampleSite()
    const hidden = hideSampleSections(site, [0, 1, 2, 3, 4])
    const result = await publishProject({ id: ID, schema: hidden })

    expect(result).toMatchObject({ ok: true })
    expect(fakeDb.rows('content_attestations')).toEqual([])
    expect(published()[0].schema_data.sections.every((s: Section) => s.hidden)).toBe(true)
  })

  it('"hide and publish" still works when the attestation store is down', async () => {
    fakeDb.attestationWriteError = 'insert failed'
    fakeDb.attestationReadError = true
    const hidden = hideSampleSections(buildSampleSite(), [0, 1, 2, 3, 4])
    expect(await publishProject({ id: ID, schema: hidden })).toMatchObject({ ok: true })
  })

  it('publishes after the owner deletes sample product rows, keeping a valid schema', async () => {
    let site = buildPublishableSite()
    site = removeOrHideSampleItem(site, 4, 2)
    site = removeOrHideSampleItem(site, 4, 1)
    // the products section is hidden now; the rest still needs approval
    const rest = ids(site)
    const result = await publishProject({ id: ID, schema: site, approvals: rest })
    expect(result).toMatchObject({ ok: true })
    expect(websiteSchema.safeParse(published()[0].schema_data).success).toBe(true)
  })

  it('does not touch attestations at all for a site without sample content', async () => {
    const result = await publishProject({ id: ID, schema: buildCleanSite() })
    expect(result).toMatchObject({ ok: true })
    expect(fakeDb.reads).not.toContain('content_attestations')
    expect(fakeDb.writes.filter((w) => w.table === 'content_attestations')).toEqual([])
  })

  it('leaves an already published site untouched when a republish is refused', async () => {
    seedProjectPublished()
    const before = { ...project() }
    const result = await publishProject({ id: ID, schema: buildSampleSite() })

    expect(result).toMatchObject({ ok: false, reason: SAMPLE_CONTENT_ERROR })
    expect(project().published).toBe(true)
    expect(project().published_version_id).toBe(before.published_version_id)
    expect(project().slug).toBe('kahve')
    expect(fakeDb.rows('project_versions')).toHaveLength(1)
  })

  it('does not engage the gate for a published site republished without sample content', async () => {
    seedProjectPublished()
    const result = await publishProject({ id: ID, schema: buildCleanSite() })
    expect(result).toMatchObject({ ok: true, slug: 'kahve' })
    expect(fakeDb.reads).not.toContain('content_attestations')
  })
})

describe('publishProject confirmed-real detected contact values', () => {
  const FAKE_PHONE = '+90 850 000 00 00'
  const siteWithPhone = (phone: string): WebsiteSchema => {
    const base = buildCleanSite()
    return {
      ...base,
      sections: [...base.sections.filter((s) => s.type !== 'contact'), { type: 'contact', title: 'İletişim', phone } as Section],
    }
  }
  const detectedIds = (site: WebsiteSchema) =>
    collectSampleFindings(site).flatMap((s) => s.items.filter((i) => i.detected).map((i) => i.id))
  const contactAttestations = () =>
    fakeDb.rows('content_attestations').filter((row) => row.statement_version === CONTACT_ATTESTATION_VERSION)

  it('asks once, then does not ask again for the same confirmed value', async () => {
    const site = siteWithPhone(FAKE_PHONE)

    const asked = await publishProject({ id: ID, schema: site })
    expect(asked).toMatchObject({ ok: false, reason: SAMPLE_CONTENT_ERROR })
    expect(published()).toEqual([])

    const confirmed = await publishProject({ id: ID, schema: site, confirmedReal: detectedIds(site) })
    expect(confirmed).toMatchObject({ ok: true })
    expect(contactAttestations()).toHaveLength(1)

    const again = await publishProject({ id: ID, schema: site })
    expect(again).toMatchObject({ ok: true })
    expect(contactAttestations()).toHaveLength(1)
    expect(JSON.stringify(published().at(-1)?.schema_data)).toContain('850 000 00 00')
  })

  it('asks again as soon as the confirmed value changes', async () => {
    const site = siteWithPhone(FAKE_PHONE)
    await publishProject({ id: ID, schema: site, confirmedReal: detectedIds(site) })

    const changed = siteWithPhone('+90 212 555 01 23')
    const result = await publishProject({ id: ID, schema: changed })
    expect(result).toMatchObject({ ok: false, reason: SAMPLE_CONTENT_ERROR })
    if (result.ok || result.reason !== SAMPLE_CONTENT_ERROR) throw new Error('expected SAMPLE_CONTENT')
    expect(result.sections.flatMap((s) => s.items).every((item) => item.detected)).toBe(true)
    expect(published()).toHaveLength(1)
    expect(contactAttestations()).toHaveLength(1)

    expect(await publishProject({ id: ID, schema: changed, confirmedReal: detectedIds(changed) })).toMatchObject({ ok: true })
    expect(contactAttestations()).toHaveLength(2)
  })

  it('does not carry a confirmation over to another project', async () => {
    const site = siteWithPhone(FAKE_PHONE)
    await publishProject({ id: ID, schema: site, confirmedReal: detectedIds(site) })

    fakeDb.rows('projects').push({ ...project(), id: 'project-2', slug: null, published: false, published_version_id: null })
    expect(await publishProject({ id: 'project-2', schema: site })).toMatchObject({ ok: false, reason: SAMPLE_CONTENT_ERROR })
  })
})

function seedProjectPublished() {
  fakeDb.reset()
  seedProject({ published: true, slug: 'kahve', published_version_id: 'project_versions-0' })
  fakeDb.rows('project_versions').push({
    id: 'project_versions-0',
    project_id: ID,
    label: 'published',
    schema_data: buildCleanSite(),
  })
}

describe('getPublishedSite', () => {
  const row = (schema: WebsiteSchema) => ({ name: 'Kahve', schema_data: schema, owner_plan_code: 'starter' })

  it('removes unapproved sample content from what visitors see', async () => {
    fakeDb.rpcRow = row(buildSampleSite())
    const site = await getPublishedSite('kahve')
    expect(site).not.toBeNull()
    const types = site!.schema.sections.map((s) => s.type)
    expect(types).not.toContain('stats')
    expect(types).not.toContain('pricing')
    expect(types).not.toContain('products')
    expect(JSON.stringify(site!.schema)).not.toContain('Ayşe')
    expect(JSON.stringify(site!.schema)).not.toContain('500+')
    expect(JSON.stringify(site!.schema)).toContain('Mehmet Kaya')
  })

  it('keeps approved content (flags cleared at publish) as published', async () => {
    const site = buildPublishableSite()
    await publishProject({ id: ID, schema: site, approvals: ids(site) })
    fakeDb.rpcRow = row(published()[0].schema_data)
    const served = await getPublishedSite('kahve')
    expect(JSON.stringify(served!.schema)).toContain('Ayşe Yılmaz')
    expect(served!.schema.sections.map((s) => s.type)).toContain('products')
  })

  it('returns a site without sample flags byte for byte', async () => {
    const clean = buildCleanSite()
    fakeDb.rpcRow = row(clean)
    const served = await getPublishedSite('kahve')
    const expected = websiteSchema.parse(clean)
    expect(JSON.stringify(served!.schema)).toBe(JSON.stringify(ensurePageIds(expected)))
    expect(JSON.stringify(stripSampleContent(expected))).toBe(JSON.stringify(expected))
  })

  it('returns null when nothing is published under that slug', async () => {
    fakeDb.rpcRow = null
    expect(await getPublishedSite('missing')).toBeNull()
  })
})
