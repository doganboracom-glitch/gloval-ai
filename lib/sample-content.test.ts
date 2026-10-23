import { describe, expect, it } from 'vitest'
import {
  approveSampleFindings,
  clearEditedSampleFlags,
  collectSampleFindings,
  hideSampleSections,
  removeOrHideSampleItem,
  sampleDigest,
  sectionHasSample,
  stripSampleContent,
  unresolvedSampleFindings,
} from '@/lib/sample-content'
import { websiteSchema, type Section } from '@/lib/website-schema'
import { buildCleanSite, buildSampleSections, buildSampleSite } from '@/lib/__fixtures__/sample-site'

const allIds = (site: ReturnType<typeof buildSampleSite>) =>
  new Set(collectSampleFindings(site).flatMap((s) => s.items.map((i) => i.id)))

describe('sample content detection', () => {
  it('finds every flagged section and item in document order with the right kind', () => {
    const findings = collectSampleFindings(buildSampleSite())
    expect(findings.map((f) => f.sectionType)).toEqual(['hero', 'testimonials', 'stats', 'pricing', 'products'])
    expect(findings.map((f) => f.sectionIndex)).toEqual([0, 1, 2, 3, 4])
    expect(findings.flatMap((f) => f.items.map((i) => i.kind))).toEqual([
      'trust',
      'testimonials',
      'stats',
      'stats',
      'pricing',
      'discount',
      'badge',
      'product',
    ])
  })

  it('reports the trust line without an item index and items with their position', () => {
    const [hero, , , , products] = collectSampleFindings(buildSampleSite())
    expect(hero.items[0].itemIndex).toBeNull()
    expect(products.items.map((i) => i.itemIndex)).toEqual([0, 1, 2])
  })

  it('ignores unflagged items inside a flagged section', () => {
    const testimonials = collectSampleFindings(buildSampleSite()).find((f) => f.sectionType === 'testimonials')
    expect(testimonials?.items).toHaveLength(1)
    expect(testimonials?.items[0].label).toContain('Ayşe Yılmaz')
  })

  it('ignores hidden sections and a flagged hero without a trust line', () => {
    const sections = buildSampleSections().map((s) => (s.type === 'testimonials' ? { ...s, hidden: true } : s)) as Section[]
    sections[0] = { ...(sections[0] as Extract<Section, { type: 'hero' }>), trustText: '  ' }
    const types = collectSampleFindings(buildSampleSite(sections)).map((f) => f.sectionType)
    expect(types).not.toContain('testimonials')
    expect(types).not.toContain('hero')
  })

  it('finds nothing on a site without sample flags', () => {
    expect(collectSampleFindings(buildCleanSite())).toEqual([])
    expect(unresolvedSampleFindings(buildCleanSite(), new Set())).toEqual([])
  })

  it('drops attested items from the unresolved list', () => {
    const site = buildSampleSite()
    const [first] = collectSampleFindings(site)
    const attested = new Set([first.items[0].id])
    expect(unresolvedSampleFindings(site, attested).map((f) => f.sectionType)).not.toContain('hero')
  })

  it('flags sections for editor badges', () => {
    const [hero, , , , products] = buildSampleSite().sections
    expect(sectionHasSample(hero)).toBe(true)
    expect(sectionHasSample(products)).toBe(true)
    expect(sectionHasSample(buildCleanSite().sections[4])).toBe(false)
  })
})

describe('sample content digest', () => {
  it('is stable, ignores surrounding whitespace and holds no readable text', () => {
    const a = sampleDigest('testimonials', ['Harika hizmet', 'Ayşe Yılmaz', 'Müşteri'])
    expect(sampleDigest('testimonials', [' Harika hizmet ', 'Ayşe Yılmaz', 'Müşteri'])).toBe(a)
    expect(a).toMatch(/^sc1-[0-9a-f]{28}$/)
    expect(a).not.toMatch(/harika|ayşe/i)
  })

  it('changes when the claim text or the section type changes', () => {
    const base = sampleDigest('stats', ['10 yıl', 'Deneyim'])
    expect(sampleDigest('stats', ['20 yıl', 'Deneyim'])).not.toBe(base)
    expect(sampleDigest('pricing', ['10 yıl', 'Deneyim'])).not.toBe(base)
  })
})

describe('approving, hiding and stripping', () => {
  it('approve clears only the approved items and the section flag once none are left', () => {
    const site = buildSampleSite()
    const stats = collectSampleFindings(site).find((f) => f.sectionType === 'stats')!
    const approved = approveSampleFindings(site, new Set([stats.items[0].id]))
    const left = collectSampleFindings(approved).find((f) => f.sectionType === 'stats')!
    expect(left.items).toHaveLength(1)
    expect(left.items[0].id).toBe(stats.items[1].id)

    const both = approveSampleFindings(site, new Set(stats.items.map((i) => i.id)))
    expect(collectSampleFindings(both).map((f) => f.sectionType)).not.toContain('stats')
    expect(both.sections[2].sample).toBeUndefined()
  })

  it('approve with nothing approved returns the same site', () => {
    const site = buildSampleSite()
    expect(approveSampleFindings(site, new Set())).toBe(site)
  })

  it('hide marks sections hidden without deleting them, so nothing is left to approve', () => {
    const site = buildSampleSite()
    const hidden = hideSampleSections(site, [0, 1, 2, 3, 4])
    expect(hidden.sections).toHaveLength(site.sections.length)
    expect(hidden.sections.every((s) => s.hidden)).toBe(true)
    expect(collectSampleFindings(hidden)).toEqual([])
    expect(hideSampleSections(site, [])).toBe(site)
  })

  it('strip removes unapproved sample content and keeps approved items', () => {
    const site = buildSampleSite()
    const testimonial = collectSampleFindings(site).find((f) => f.sectionType === 'testimonials')!
    // Placeholder testimonials cannot be approved: approving is a no-op and they never ship.
    const approved = approveSampleFindings(site, new Set([testimonial.items[0].id]))
    const stripped = stripSampleContent(approved)

    const testimonials = stripped.sections.find((s) => s.type === 'testimonials') as Extract<Section, { type: 'testimonials' }>
    expect(testimonials.items.map((i) => i.author)).toEqual(['Mehmet Kaya'])
    const types = stripped.sections.map((s) => s.type)
    expect(types).not.toContain('stats')
    expect(types).not.toContain('pricing')
    expect(types).not.toContain('products')
    const hero = stripped.sections[0] as Extract<Section, { type: 'hero' }>
    expect(hero.trustText).toBeUndefined()
    expect(collectSampleFindings(stripped)).toEqual([])
  })

  it('strip keeps the unflagged items of a partly flagged section', () => {
    const stripped = stripSampleContent(buildSampleSite())
    // testimonials: the flagged quote goes, the owner's own quote stays
    const testimonials = stripped.sections.find((s) => s.type === 'testimonials') as Extract<Section, { type: 'testimonials' }>
    expect(testimonials.items.map((i) => i.author)).toEqual(['Mehmet Kaya'])
    expect(testimonials.sample).toBeUndefined()
  })

  it('strip leaves hidden flagged sections alone', () => {
    const hidden = hideSampleSections(buildSampleSite(), [4])
    const stripped = stripSampleContent(hidden)
    expect(stripped.sections.find((s) => s.type === 'products')).toBeDefined()
  })

  it('strip returns the identical object for a site without flags', () => {
    const clean = buildCleanSite()
    const stripped = stripSampleContent(clean)
    expect(stripped).toBe(clean)
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(clean))
  })

  it('an edited flagged item becomes the owner’s and drops its flag', () => {
    const prev = buildSampleSite()
    const next = buildSampleSite(
      buildSampleSections().map((s) =>
        s.type === 'stats' ? { ...s, items: s.items.map((i, n) => (n === 0 ? { ...i, value: '15 yıl' } : i)) } : s,
      ) as Section[],
    )
    const cleared = clearEditedSampleFlags(prev, next)
    const stats = cleared.sections.find((s) => s.type === 'stats') as Extract<Section, { type: 'stats' }>
    expect(stats.items[0].sample).toBeUndefined()
    expect(stats.items[1].sample).toBe(true)
    expect(allIds(cleared).size).toBe(allIds(prev).size - 1)
  })
})

describe('deleting a sample product row', () => {
  const products = (site: ReturnType<typeof buildSampleSite>) =>
    site.sections.find((s) => s.type === 'products') as Extract<Section, { type: 'products' }>

  it('removes just that row and keeps the section visible', () => {
    const site = buildSampleSite()
    const next = removeOrHideSampleItem(site, 4, 1)
    expect(products(next).items.map((i) => i.name)).toEqual(['Ürün A', 'Ürün C'])
    expect(products(next).hidden).toBeUndefined()
  })

  it('hides the section instead of deleting when removal would break the schema minimum', () => {
    let site = buildSampleSite()
    site = removeOrHideSampleItem(site, 4, 2)
    expect(products(site).items).toHaveLength(2)
    expect(products(site).hidden).toBeUndefined()
    // products need at least two items, so the next delete hides the section
    site = removeOrHideSampleItem(site, 4, 1)
    expect(products(site).hidden).toBe(true)
    expect(products(site).items).toHaveLength(2)
    expect(collectSampleFindings(site).map((f) => f.sectionType)).not.toContain('products')
  })

  it('hides a single-item section when its last item is deleted', () => {
    const site = removeOrHideSampleItem(buildSampleSite(), 3, 0)
    expect(site.sections[3].hidden).toBe(true)
    expect((site.sections[3] as Extract<Section, { type: 'pricing' }>).plans).toHaveLength(1)
  })

  it('ignores an out-of-range row and a section that has no items', () => {
    const site = buildSampleSite()
    expect(removeOrHideSampleItem(site, 4, 9)).toBe(site)
    expect(removeOrHideSampleItem(site, 99, 0)).toBe(site)
  })

  it('leaves a site that still passes schema validation', () => {
    let site = buildSampleSite()
    site = removeOrHideSampleItem(site, 4, 2)
    expect(websiteSchema.safeParse(site).success).toBe(true)
    site = removeOrHideSampleItem(site, 4, 1)
    expect(websiteSchema.safeParse(site).success).toBe(true)
  })
})
