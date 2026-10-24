import { describe, expect, it } from 'vitest'
import { guardEdit } from './edit-guard'
import { SITE_SECTION_HARD_CAP } from './pricing-config'
import { ADDABLE_SECTION_TYPES, applyOperation } from './website-edit-operations'
import { countCappedSections, type WebsiteSchema } from './website-schema'

/** A dbajans-like site padded with `about` sections up to `count` regular sections (hero and footer included). */
function siteWith(count: number): WebsiteSchema {
  const sections: unknown[] = [
    { type: 'hero', title: 'DB Ajans', description: 'Reklam ve tanıtım' },
    {
      type: 'gallery',
      title: 'Galeri',
      items: [
        { src: 'https://example.com/a.jpg', alt: 'Ofis' },
        { src: 'https://example.com/b.jpg', alt: 'Ekip' },
      ],
    },
  ]
  while (sections.length < count - 1) sections.push({ type: 'about', title: `Hakkımızda ${sections.length}`, body: 'Metin' })
  sections.push({ type: 'footer' })
  return {
    meta: { name: 'DB Ajans', language: 'tr' },
    navigation: { logoText: 'DB Ajans', links: [] },
    pages: [{ slug: 'home', title: 'Ana Sayfa', isHome: true }],
    sections,
  } as unknown as WebsiteSchema
}

describe('adding a section from the menu', () => {
  for (const count of [3, 11, 12, 13, SITE_SECTION_HARD_CAP - 1]) {
    it(`accepts every addable type on a site with ${count} sections`, () => {
      const live = siteWith(count)
      for (const type of ADDABLE_SECTION_TYPES) {
        const next = applyOperation(live, { op: 'addSection', sectionType: type })
        const label = `${type} @ ${count}`
        // An announcement band is capped at one and a second hero is allowed by the menu filter only.
        expect(next.sections.length, label).toBe(live.sections.length + 1)
        expect(guardEdit(live, next), label).toEqual({ ok: true })
      }
    })
  }

  it('adds a team section (Kadromuz) past the old 12-section limit', () => {
    const live = siteWith(12)
    const next = applyOperation(live, { op: 'addSection', sectionType: 'team' })
    expect(next.sections.some((s) => s.type === 'team')).toBe(true)
    expect(guardEdit(live, next)).toEqual({ ok: true })
  })

  it('keeps the footer last', () => {
    const next = applyOperation(siteWith(13), { op: 'addSection', sectionType: 'team' })
    expect(next.sections[next.sections.length - 1].type).toBe('footer')
  })

  it('stops at the hard cap and the guard names that limit', () => {
    let live = siteWith(SITE_SECTION_HARD_CAP - 1)
    live = applyOperation(live, { op: 'addSection', sectionType: 'team' })
    expect(countCappedSections(live.sections)).toBe(SITE_SECTION_HARD_CAP)

    const refused = applyOperation(live, { op: 'addSection', sectionType: 'faq' })
    expect(refused.sections.length).toBe(live.sections.length)

    const forced = structuredClone(live)
    forced.sections.splice(forced.sections.length - 1, 0, { type: 'about', title: 'x', body: 'y' } as never)
    const verdict = guardEdit(live, forced)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.message).toContain(String(SITE_SECTION_HARD_CAP))
  })

  it('names the entry limit when a list section would break', () => {
    const live = siteWith(5)
    const broken = structuredClone(live)
    const gallery = broken.sections.find((s) => s.type === 'gallery') as { items: unknown[] }
    gallery.items = []
    const verdict = guardEdit(live, broken)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.message).toMatch(/en az 1 öğe/)
  })
})
