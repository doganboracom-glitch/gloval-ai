import { describe, expect, it } from 'vitest'
import { applyOperation } from './website-edit-operations'
import { parseCommand } from './website-command-parser'
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
