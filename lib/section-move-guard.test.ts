import { describe, expect, it } from 'vitest'
import { guardEdit } from './edit-guard'
import { ADDABLE_SECTION_TYPES, applyOperation, blankSection } from './website-edit-operations'
import { websiteSchema, type WebsiteSchema } from './website-schema'

/**
 * A dbajans-like site: its gallery holds two OWNER-UPLOADED photos, which carry
 * `src` and `alt` but no `imagePrompt` (the schema marks it required, so the
 * section already has two pre-existing validation issues).
 */
function dbajansLikeSite(): WebsiteSchema {
  return {
    meta: { name: 'DB Ajans', language: 'tr' },
    navigation: { logoText: 'DB Ajans', links: [] },
    pages: [{ slug: 'home', title: 'Ana Sayfa', isHome: true }],
    sections: [
      { type: 'hero', title: 'DB Ajans', description: 'Reklam ve tanıtım' },
      { type: 'about', title: 'Hakkımızda', body: 'Metin' },
      {
        type: 'gallery',
        title: 'Galeri',
        items: [
          { src: 'https://example.com/a.jpg', alt: 'Ofis' },
          { src: 'https://example.com/b.jpg', alt: 'Ekip' },
        ],
      },
      { type: 'faq', title: 'SSS', items: [{ question: 'Q', answer: 'A' }] },
      { type: 'footer' },
    ],
  } as unknown as WebsiteSchema
}

describe('moving a section whose content already had a schema problem', () => {
  it('the fixture really has pre-existing issues', () => {
    expect(websiteSchema.safeParse(dbajansLikeSite()).success).toBe(false)
  })

  it('is not rejected just because the issue path shifted with the section index', () => {
    const live = dbajansLikeSite()
    const galleryIndex = live.sections.findIndex((s) => s.type === 'gallery')
    for (const direction of ['up', 'down'] as const) {
      const moved = applyOperation(live, { op: 'moveSection', index: galleryIndex, direction })
      expect(moved.sections[galleryIndex + (direction === 'up' ? -1 : 1)].type).toBe('gallery')
      expect(guardEdit(live, moved)).toEqual({ ok: true })
    }
  })

  it('still rejects an edit that introduces a NEW problem in that section', () => {
    const live = dbajansLikeSite()
    const galleryIndex = live.sections.findIndex((s) => s.type === 'gallery')
    const broken = structuredClone(live)
    ;(broken.sections[galleryIndex] as { items: unknown[] }).items = []
    expect(guardEdit(live, broken).ok).toBe(false)
  })
})

describe('moving any section type to any position', () => {
  it('is always accepted, whatever problems the site already had', () => {
    const sections = ADDABLE_SECTION_TYPES.map((type) => blankSection(type, 'tr'))
    const live = {
      meta: { name: 'Acme', language: 'tr' },
      navigation: { logoText: 'Acme', links: [] },
      pages: [{ slug: 'home', title: 'Ana Sayfa', isHome: true }],
      sections: [...sections, { type: 'footer' }],
    } as unknown as WebsiteSchema

    live.sections.forEach((section, index) => {
      for (const direction of ['up', 'down'] as const) {
        const target = direction === 'up' ? index - 1 : index + 1
        if (target < 0 || target >= live.sections.length) continue
        const moved = applyOperation(live, { op: 'moveSection', index, direction })
        expect(moved.sections[target].type, `${section.type} ${direction}`).toBe(section.type)
        expect(guardEdit(live, moved), `${section.type} ${direction}`).toEqual({ ok: true })
      }
    })
  })
})
