import { describe, expect, it } from 'vitest'
import {
  ANNOUNCEMENT_PX_PER_SECOND,
  announcementMarqueeTiming,
  announcementPlacement,
  estimateAnnouncementUnitWidth,
  isInvalidAnnouncementLink,
  safeAnnouncementHref,
} from './announcement'
import { applyOperation } from './website-edit-operations'
import { SITE_SECTION_HARD_CAP } from './pricing-config'
import {
  ANNOUNCEMENT_MAX_ITEMS,
  ANNOUNCEMENT_TEXT_MAX,
  countAnnouncements,
  countCappedSections,
  type WebsiteSchema,
} from './website-schema'

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

describe('announcementMarqueeTiming', () => {
  const speedPxPerSecond = (unitWidth: number, viewportWidth: number, speed: 'slow' | 'normal' | 'fast') => {
    const { repeats, durationSeconds } = announcementMarqueeTiming({ unitWidth, viewportWidth, speed })
    return (unitWidth * repeats) / durationSeconds
  }

  it('scrolls at the same px/second for short and long text', () => {
    for (const speed of ['slow', 'normal', 'fast'] as const) {
      const expected = ANNOUNCEMENT_PX_PER_SECOND[speed]
      expect(speedPxPerSecond(180, 1200, speed)).toBeCloseTo(expected, 5)
      expect(speedPxPerSecond(2400, 1200, speed)).toBeCloseTo(expected, 5)
    }
  })

  it('orders speeds slow < normal < fast for the same content', () => {
    const duration = (speed: 'slow' | 'normal' | 'fast') =>
      announcementMarqueeTiming({ unitWidth: 600, viewportWidth: 1200, speed }).durationSeconds
    expect(duration('slow')).toBeGreaterThan(duration('normal'))
    expect(duration('normal')).toBeGreaterThan(duration('fast'))
  })

  it('repeats short text so a group always covers the band (no gap)', () => {
    const { repeats } = announcementMarqueeTiming({ unitWidth: 200, viewportWidth: 1000, speed: 'normal' })
    expect(repeats).toBe(5)
    expect(200 * repeats).toBeGreaterThanOrEqual(1000)
    expect(announcementMarqueeTiming({ unitWidth: 4000, viewportWidth: 1000 }).repeats).toBe(1)
  })

  it('stays finite and bounded for degenerate widths and defaults to normal', () => {
    const zero = announcementMarqueeTiming({ unitWidth: 0, viewportWidth: 0 })
    expect(Number.isFinite(zero.durationSeconds)).toBe(true)
    expect(zero.repeats).toBeLessThanOrEqual(24)
    const legacy = announcementMarqueeTiming({ unitWidth: 600, viewportWidth: 600 })
    expect(legacy.durationSeconds).toBeCloseTo(600 / ANNOUNCEMENT_PX_PER_SECOND.normal, 5)
  })

  it('estimates a larger unit for longer text', () => {
    expect(estimateAnnouncementUnitWidth(['a'.repeat(100)])).toBeGreaterThan(estimateAnnouncementUnitWidth(['a']))
  })
})

describe('announcement link hint', () => {
  it('flags only non-empty links that would not render as links', () => {
    expect(isInvalidAnnouncementLink('javascript:alert(1)')).toBe(true)
    expect(isInvalidAnnouncementLink('not a link')).toBe(true)
    expect(isInvalidAnnouncementLink('https://example.com')).toBe(false)
    expect(isInvalidAnnouncementLink('/iletisim')).toBe(false)
    expect(isInvalidAnnouncementLink('')).toBe(false)
    expect(isInvalidAnnouncementLink('   ')).toBe(false)
    expect(isInvalidAnnouncementLink(undefined)).toBe(false)
  })
})

describe('announcement item editing', () => {
  const withBand = () => applyOperation(site(), { op: 'addSection', sectionType: 'announcement' })

  it('marks a freshly added band and its item as sample content', () => {
    const band = withBand().sections[0] as unknown as { sample?: boolean; items: { sample?: boolean }[] }
    expect(band.sample).toBe(true)
    expect(band.items[0].sample).toBe(true)
  })

  it('marks an added item as sample and stops at the item limit', () => {
    let next = withBand()
    for (let i = 0; i < ANNOUNCEMENT_MAX_ITEMS + 2; i++) next = applyOperation(next, { op: 'addItem', index: 0 })
    const items = (next.sections[0] as unknown as { items: { sample?: boolean }[] }).items
    expect(items).toHaveLength(ANNOUNCEMENT_MAX_ITEMS)
    expect(items.every((item) => item.sample === true)).toBe(true)
  })

  it('caps text and link length and trims the link', () => {
    const base = withBand()
    const texted = applyOperation(base, {
      op: 'updateItemField',
      index: 0,
      itemIndex: 0,
      field: 'text',
      value: 'x'.repeat(ANNOUNCEMENT_TEXT_MAX + 50),
    })
    const linked = applyOperation(texted, {
      op: 'updateItemField',
      index: 0,
      itemIndex: 0,
      field: 'link',
      value: `  /${'a'.repeat(600)}  `,
    })
    const item = (linked.sections[0] as unknown as { items: { text: string; link: string }[] }).items[0]
    expect(item.text).toHaveLength(ANNOUNCEMENT_TEXT_MAX)
    expect(item.link).toHaveLength(500)
    expect(item.link.startsWith('/')).toBe(true)
  })
})
