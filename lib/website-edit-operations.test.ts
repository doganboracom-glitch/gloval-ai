import { describe, expect, it } from 'vitest'
import { applyOperation } from './website-edit-operations'
import { parseCommand } from './website-command-parser'
import { buildInfoPage } from './info-pages'
import type { WebsiteSchema } from './website-schema'

function makeSite(): WebsiteSchema {
  return {
    meta: { name: 'dbajans', language: 'tr' },
    navigation: {
      logoText: 'dbajans',
      links: [
        { label: 'Ana Sayfa', href: '#hero' },
        { label: 'Özellikler', href: '#features' },
        { label: 'Çözümler', href: '#services' },
      ],
      cta: { label: 'S.S.S', href: '#contact' },
    },
    pages: [
      { slug: 'home', title: 'Ana Sayfa', isHome: true },
      { slug: 'features', title: 'Özellikler' },
      { slug: 'pricing', title: 'Fiyatlandırma' },
    ],
    sections: [{ type: 'hero' }, { type: 'features' }, { type: 'services' }],
  } as unknown as WebsiteSchema
}

const labels = (site: WebsiteSchema) => site.navigation.links.map((l) => l.label)
const slugs = (site: WebsiteSchema) => site.pages.map((p) => p.slug)

describe('SEO description editing', () => {
  it('cleans HTML, caps the text at 160 characters, and allows clearing', () => {
    const site = makeSite()
    site.meta.description = 'Previous description'

    const updated = applyOperation(site, {
      op: 'updateMeta',
      description: `<p>${'x'.repeat(180)}</p>`,
    })

    expect(updated.meta.description).toBe('x'.repeat(160))
    expect(site.meta.description).toBe('Previous description')
    expect(applyOperation(updated, { op: 'updateMeta', description: '' }).meta.description).toBe('')
  })
})

describe('removePage', () => {
  it('drops the page and its own menu link together', () => {
    const next = applyOperation(makeSite(), { op: 'removePage', pageIndex: 1 })
    expect(slugs(next)).toEqual(['home', 'pricing'])
    expect(labels(next)).toEqual(['Ana Sayfa', 'Çözümler'])
  })

  it('leaves the homepage sections untouched', () => {
    const next = applyOperation(makeSite(), { op: 'removePage', pageIndex: 1 })
    expect(next.sections).toHaveLength(3)
  })

  it('never empties the menu', () => {
    const site = makeSite()
    site.navigation.links = [{ label: 'Özellikler', href: '#features' }]
    const next = applyOperation(site, { op: 'removePage', pageIndex: 1 })
    expect(labels(next)).toEqual(['Özellikler'])
  })

  it('does not remove the homepage', () => {
    const next = applyOperation(makeSite(), { op: 'removePage', pageIndex: 0 })
    expect(slugs(next)).toContain('home')
  })
})

describe('menu removal command', () => {
  it('removes exactly the named item, with no stray second removal', () => {
    const site = makeSite()
    const parsed = parseCommand('Özellikler bölümünü üst menüden kaldır', site)
    expect(parsed).not.toBeNull()
    const result = (parsed?.operations ?? []).reduce(applyOperation, site)
    expect(labels(result)).toEqual(['Ana Sayfa', 'Çözümler'])
    expect(slugs(result)).toEqual(['home', 'pricing'])
  })
})

describe('addInfoPage', () => {
  it('adds a real info page with a unique slug and keeps placeholders flagged', () => {
    const site = makeSite()
    const draft = buildInfoPage({ template: 'faq', lang: 'tr', sector: 'default' as never, existingSlugs: site.pages.map((p) => p.slug) })
    const once = applyOperation(site, {
      op: 'addInfoPage',
      page: { slug: draft.slug, title: draft.title, sections: draft.sections, seo: draft.seo },
    })
    const twice = applyOperation(once, {
      op: 'addInfoPage',
      page: { slug: draft.slug, title: draft.title, sections: draft.sections, seo: draft.seo },
    })
    expect(once.pages.length).toBe(site.pages.length + 1)
    expect(twice.pages.length).toBe(site.pages.length + 2)
    const slugs = twice.pages.map((p) => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const added = once.pages[once.pages.length - 1]
    expect(added.kind).toBe('info')
    expect(draft.placeholders).toBeGreaterThan(0)
  })

  it('ignores an empty title', () => {
    const site = makeSite()
    const next = applyOperation(site, { op: 'addInfoPage', page: { slug: 'x', title: '  ', sections: [] } })
    expect(next.pages.length).toBe(site.pages.length)
  })
})

describe('buildInfoPage store facts', () => {
  it('does not claim shipping facts when nothing is configured', () => {
    const draft = buildInfoPage({ template: 'shipping', lang: 'tr', sector: 'ecommerce', store: { shipping: null, payment: null }, existingSlugs: [] })
    expect(draft.placeholders).toBeGreaterThan(0)
  })

  it('uses configured shipping facts', () => {
    const draft = buildInfoPage({
      template: 'shipping',
      lang: 'tr',
      sector: 'ecommerce',
      store: { shipping: { feeCents: 4999, freeThresholdCents: 50000, deliveryNote: null, carrierName: null }, payment: null },
      existingSlugs: [],
    })
    expect(JSON.stringify(draft.sections)).toContain('49')
  })
})
