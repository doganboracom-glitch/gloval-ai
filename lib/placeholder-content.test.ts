import { describe, expect, it } from 'vitest'
import { stripPlaceholders } from './placeholder-content'
import { ADDABLE_SECTION_TYPES, addedSectionIndex, applyOperation, blankSection } from './website-edit-operations'
import type { WebsiteSchema } from './website-schema'

function site(language: 'tr' | 'en' = 'tr'): WebsiteSchema {
  return {
    meta: { name: 'DB Ajans', language },
    navigation: { logoText: 'DB Ajans', links: [] },
    pages: [{ slug: 'home', title: 'Ana Sayfa', isHome: true }],
    sections: [
      { type: 'hero', title: 'DB Ajans', description: 'Reklam ve tanıtım' },
      { type: 'about', title: 'Hakkımızda', body: 'Metin' },
      { type: 'footer' },
    ],
  } as unknown as WebsiteSchema
}

const LIST_TYPES = ['services', 'features', 'stats', 'pricing', 'testimonials', 'gallery', 'portfolio', 'categories', 'process', 'faq', 'slider'] as const

describe('addedSectionIndex', () => {
  it('lands above the footer, at the bottom of the content', () => {
    const live = site()
    expect(addedSectionIndex(live.sections, 'services')).toBe(2)
    const next = applyOperation(live, { op: 'addSection', sectionType: 'services' })
    expect(next.sections[2].type).toBe('services')
    expect(next.sections[3].type).toBe('footer')
  })
})

describe('stripPlaceholders', () => {
  it('keeps the same object when nothing is a placeholder', () => {
    const live = site()
    expect(stripPlaceholders(live)).toBe(live)
  })

  it.each(['tr', 'en'] as const)('hides an untouched added section on the public site (%s)', (lang) => {
    for (const type of LIST_TYPES) {
      const live = applyOperation(site(lang), { op: 'addSection', sectionType: type })
      const shown = stripPlaceholders(live)
      expect(shown.sections.map((s) => s.type), type).not.toContain(type)
      expect(live.sections.map((s) => s.type), type).toContain(type)
    }
  })

  it('never hides single-copy sections, even when equal to the blank template', () => {
    for (const lang of ['tr', 'en'] as const) {
      for (const type of ['hero', 'about', 'contact', 'cta'] as const) {
        const blank = blankSection(type, lang, { corporate: true })
        const live = { ...site(lang), sections: [blank, { type: 'footer' }] } as unknown as WebsiteSchema
        expect(stripPlaceholders(live), `${lang}:${type}`).toBe(live)
      }
    }
  })

  it('keeps an added contact section visible on the public site', () => {
    const live = applyOperation(site(), { op: 'addSection', sectionType: 'contact' })
    const shown = stripPlaceholders(live)
    expect(shown.sections.filter((s) => s.type === 'contact')).toHaveLength(1)
  })

  it('shows a section as soon as an entry is edited, dropping only the untouched ones', () => {
    const live = applyOperation(site(), { op: 'addSection', sectionType: 'services' })
    const services = live.sections[2] as unknown as { items: Array<{ title: string; description: string; icon: string }> }
    services.items[0].title = 'Reklam çekimi'
    const shown = stripPlaceholders(live)
    const shownServices = shown.sections.find((s) => s.type === 'services') as unknown as { items: Array<{ title: string }> }
    expect(shownServices.items.map((i) => i.title)).toEqual(['Reklam çekimi'])
  })

  it('treats an entry with an image as real content', () => {
    const live = applyOperation(site(), { op: 'addSection', sectionType: 'gallery' })
    const gallery = live.sections[2] as unknown as { items: Array<Record<string, unknown>> }
    gallery.items[0].image = 'https://example.com/a.jpg'
    const shown = stripPlaceholders(live)
    const shownGallery = shown.sections.find((s) => s.type === 'gallery') as unknown as { items: unknown[] }
    expect(shownGallery.items).toHaveLength(1)
  })

  it('never touches the editor data itself', () => {
    const live = applyOperation(site(), { op: 'addSection', sectionType: 'faq' })
    const before = JSON.stringify(live)
    stripPlaceholders(live)
    expect(JSON.stringify(live)).toBe(before)
  })

  it('covers every addable type without throwing', () => {
    for (const type of ADDABLE_SECTION_TYPES) {
      expect(() => stripPlaceholders(applyOperation(site(), { op: 'addSection', sectionType: type }))).not.toThrow()
    }
  })
})
