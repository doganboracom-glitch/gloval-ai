import { describe, expect, it } from 'vitest'
import { announcementPlacement, safeAnnouncementHref } from './announcement'
import { applyOperation } from './website-edit-operations'
import { SITE_SECTION_HARD_CAP } from './pricing-config'
import { countAnnouncements, countCappedSections, type WebsiteSchema } from './website-schema'

function site(sections: unknown[] = [{ type: 'hero' }, { type: 'footer' }]): WebsiteSchema {
  return {
    meta: { name: 'Acme', language: 'tr' },
    navigation: { logoText: 'Acme', links: [] },
    pages: [{ slug: 'home', title: 'Ana Sayfa', isHome: true }],
    sections,
  } as unknown as WebsiteSchema
}

describe('safeAnnouncementHref', () => {
  it('accepts https/http URLs, site paths and anchors', () => {
    expect(safeAnnouncementHref('https://example.com/a')).toBe('https://example.com/a')
    expect(safeAnnouncementHref('/hakkimizda')).toBe('/hakkimizda')
    expect(safeAnnouncementHref('#iletisim')).toBe('#iletisim')
  })

  it('rejects unsafe or half-typed links', () => {
    expect(safeAnnouncementHref('javascript:alert(1)')).toBeNull()
    expect(safeAnnouncementHref('data:text/html,x')).toBeNull()
    expect(safeAnnouncementHref('//evil.com')).toBeNull()
    expect(safeAnnouncementHref('not a link')).toBeNull()
    expect(safeAnnouncementHref('   ')).toBeNull()
    expect(safeAnnouncementHref(undefined)).toBeNull()
  })
})

describe('announcementPlacement', () => {
  it('is above the header only when the band is the first section', () => {
    expect(announcementPlacement([{ type: 'announcement' }, { type: 'hero' }])).toBe('above-header')
  })

  it('renders in the page flow at any other position', () => {
    expect(announcementPlacement([{ type: 'hero' }, { type: 'announcement' }, { type: 'faq' }])).toBe('in-flow')
    expect(announcementPlacement([{ type: 'hero' }, { type: 'faq' }, { type: 'announcement' }])).toBe('in-flow')
  })

  it('skips hidden sections when deciding what is first', () => {
    expect(
      announcementPlacement([{ type: 'hero', hidden: true }, { type: 'announcement' }, { type: 'faq' }]),
    ).toBe('above-header')
  })

  it('is none without a visible band', () => {
    expect(announcementPlacement([{ type: 'hero' }, { type: 'faq' }])).toBe('none')
    expect(announcementPlacement([{ type: 'announcement', hidden: true }, { type: 'hero' }])).toBe('none')
    expect(announcementPlacement([])).toBe('none')
  })

  it('keeps legacy records (band stored first, no extra fields) above the header', () => {
    const legacy = site([{ type: 'announcement', items: [{ text: 'Eski duyuru' }] }, { type: 'hero' }])
    expect(announcementPlacement(legacy.sections)).toBe('above-header')
    expect(countAnnouncements(legacy.sections)).toBe(1)
  })
})

describe('announcement band operations', () => {
  it('adds a single band at the top and ignores a second one', () => {
    const once = applyOperation(site(), { op: 'addSection', sectionType: 'announcement' })
    expect(once.sections[0].type).toBe('announcement')
    const twice = applyOperation(once, { op: 'addSection', sectionType: 'announcement' })
    expect(countAnnouncements(twice.sections)).toBe(1)
    expect(twice.sections).toHaveLength(once.sections.length)
  })

  it('does not count toward the section cap', () => {
    const filler = Array.from({ length: SITE_SECTION_HARD_CAP }, () => ({ type: 'about' }))
    const withBand = [{ type: 'announcement', items: [{ text: 'x' }] }, ...filler]
    expect(countCappedSections(withBand)).toBe(SITE_SECTION_HARD_CAP)
    expect(countAnnouncements(withBand)).toBe(1)
  })

  it('cannot be converted to or created from another section type', () => {
    const base = applyOperation(site(), { op: 'addSection', sectionType: 'announcement' })
    expect(applyOperation(base, { op: 'changeSectionType', index: 0, sectionType: 'about' })).toEqual(base)
    expect(applyOperation(base, { op: 'changeSectionType', index: 1, sectionType: 'announcement' })).toEqual(base)
  })

  it('moves like any other section, anywhere in the list', () => {
    const base = applyOperation(site([{ type: 'hero' }, { type: 'faq' }, { type: 'footer' }]), {
      op: 'addSection',
      sectionType: 'announcement',
    })
    expect(base.sections.map((s) => s.type)).toEqual(['announcement', 'hero', 'faq', 'footer'])
    const afterHero = applyOperation(base, { op: 'moveSection', index: 0, direction: 'down' })
    expect(afterHero.sections.map((s) => s.type)).toEqual(['hero', 'announcement', 'faq', 'footer'])
    const aboveFaq = applyOperation(afterHero, { op: 'moveSection', index: 1, direction: 'down' })
    expect(aboveFaq.sections.map((s) => s.type)).toEqual(['hero', 'faq', 'announcement', 'footer'])
    const backToTop = applyOperation(
      applyOperation(aboveFaq, { op: 'moveSection', index: 2, direction: 'up' }),
      { op: 'moveSection', index: 1, direction: 'up' },
    )
    expect(backToTop.sections.map((s) => s.type)).toEqual(['announcement', 'hero', 'faq', 'footer'])
    expect(countAnnouncements(aboveFaq.sections)).toBe(1)
  })

  it('updates behavior flags', () => {
    const base = applyOperation(site(), { op: 'addSection', sectionType: 'announcement' })
    const next = applyOperation(base, {
      op: 'updateAnnouncement',
      index: 0,
      patch: { speed: 'fast', dismissible: true, pauseOnHover: false },
    })
    expect(next.sections[0]).toMatchObject({ speed: 'fast', dismissible: true, pauseOnHover: false })
  })
})
