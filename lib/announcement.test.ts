import { describe, expect, it } from 'vitest'
import { safeAnnouncementHref } from './announcement'
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
