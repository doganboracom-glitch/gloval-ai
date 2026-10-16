import { describe, expect, it } from 'vitest'
import {
  buildDefaultFooterColumns,
  customKindOf,
  defaultLegalLinks,
  footerTargetOptions,
  implicitLegalLinks,
  resolveFooterColumns,
  resolveFooterLegal,
  resolveStoreEssentialPageLinks,
  sanitizeFooterColumns,
  seedFooterColumns,
  seedFooterLegal,
  validateFooterHref,
} from './footer-links'
import { applyOperation } from './website-edit-operations'
import type { WebsiteSchema } from './website-schema'

function corporate(): WebsiteSchema {
  return {
    meta: { name: 'Acme', language: 'tr' },
    navigation: { logoText: 'Acme', links: [{ label: 'Ana Sayfa', href: '#hero' }] },
    pages: [
      { slug: 'home', title: 'Ana Sayfa', isHome: true },
      { slug: 'hakkimizda', title: 'Hakkımızda' },
    ],
    sections: [{ type: 'hero' }, { type: 'about' }, { type: 'services' }, { type: 'footer' }],
  } as unknown as WebsiteSchema
}

function store(): WebsiteSchema {
  const site = corporate()
  site.sections.splice(1, 0, { type: 'products' } as never)
  return site
}

describe('validateFooterHref', () => {
  it('rejects empty, "#" and insecure targets', () => {
    expect(validateFooterHref('', corporate()).ok).toBe(false)
    expect(validateFooterHref('#', corporate()).ok).toBe(false)
    expect(validateFooterHref('http://example.com', corporate()).ok).toBe(false)
    expect(validateFooterHref('javascript:alert(1)', corporate()).ok).toBe(false)
  })

  it('accepts https, mailto, tel and existing sections', () => {
    const site = corporate()
    expect(validateFooterHref('https://example.com', site).ok).toBe(true)
    expect(validateFooterHref('mailto:hi@example.com', site).ok).toBe(true)
    expect(validateFooterHref('tel:+905320000000', site).ok).toBe(true)
    expect(validateFooterHref('#about', site).ok).toBe(true)
  })

  it('rejects sections that do not exist and store targets on non-stores', () => {
    const site = corporate()
    expect(validateFooterHref('#pricing', site).ok).toBe(false)
    expect(validateFooterHref('/store', site).ok).toBe(false)
    expect(validateFooterHref('/store', store()).ok).toBe(true)
  })

  it('accepts only known official texts', () => {
    expect(validateFooterHref('/yasal/gizlilik-politikasi', corporate()).ok).toBe(true)
    expect(validateFooterHref('/yasal/yok-boyle-bir-sey', corporate()).ok).toBe(false)
  })
})

describe('footer columns', () => {
  it('sanitizer drops unlabeled / dead links and emptied columns', () => {
    const out = sanitizeFooterColumns(
      [
        {
          title: ' Kurumsal ',
          links: [
            { label: 'Hakkımızda', href: '#about' },
            { label: '', href: '#about' },
            { label: 'Ölü', href: '#' },
          ],
        },
        { title: 'Boş', links: [{ label: 'x', href: '' }] },
        { title: '', links: [{ label: 'y', href: '#about' }] },
      ],
      corporate(),
    )
    expect(out).toEqual([{ title: 'Kurumsal', links: [{ label: 'Hakkımızda', href: '#about' }] }])
  })

  it('resolveFooterColumns agrees with what is rendered', () => {
    const rendered = resolveFooterColumns(
      [{ title: 'A', links: [{ label: 'ok', href: '#about' }, { label: 'dead', href: '#faq' }] }],
      corporate(),
    )
    expect(rendered[0].links.map((l) => l.label)).toEqual(['ok'])
  })

  it('updateFooterLinks saves only valid entries', () => {
    const site = corporate()
    const next = applyOperation(site, {
      op: 'updateFooterLinks',
      index: 3,
      columns: [
        {
          title: 'Menü',
          links: [
            { label: 'Hizmetler', href: '#services' },
            { label: 'Boş hedef', href: '' },
          ],
        },
      ],
    })
    const footer = next.sections[3] as { columns?: unknown }
    expect(footer.columns).toEqual([
      { title: 'Menü', links: [{ label: 'Hizmetler', href: '#services' }] },
    ])
  })

  it('updateFooterLinks can hide the official-text bar', () => {
    const next = applyOperation(corporate(), {
      op: 'updateFooterLinks',
      index: 3,
      legal: { hidden: true, links: [] },
    })
    const footer = next.sections[3] as { legal?: { hidden?: boolean } }
    expect(footer.legal?.hidden).toBe(true)
    expect(resolveFooterLegal(footer.legal, next)).toEqual([])
  })
})

describe('defaults and seeding', () => {
  it('only links things that exist, on both site kinds', () => {
    for (const site of [corporate(), store()]) {
      for (const column of buildDefaultFooterColumns(site) ?? []) {
        for (const link of column.links) {
          expect(validateFooterHref(link.href, site).ok).toBe(true)
        }
      }
    }
  })

  it('stores get shop links, corporate sites do not', () => {
    const hrefs = (s: WebsiteSchema) =>
      (buildDefaultFooterColumns(s) ?? []).flatMap((c) => c.links.map((l) => l.href))
    expect(hrefs(store())).toContain('/store')
    expect(hrefs(corporate())).not.toContain('/store')
  })

  it('seedFooterColumns persists defaults once and never overwrites', () => {
    const seeded = seedFooterColumns(store())
    const footer = seeded.sections.find((s) => s.type === 'footer') as { columns?: unknown[] }
    expect(footer.columns?.length).toBeGreaterThan(0)
    expect(seedFooterColumns(seeded)).toBe(seeded)
  })

  it('default official texts are all valid', () => {
    for (const kind of ['ecommerce', 'corporate'] as const) {
      for (const link of defaultLegalLinks(kind)) {
        expect(validateFooterHref(link.href, kind === 'ecommerce' ? store() : corporate()).ok).toBe(true)
      }
    }
  })
})

describe('corporate footer legal links', () => {
  const labels = (links: { label: string }[]) => links.map((l) => l.label)

  it('new corporate defaults carry only the privacy policy', () => {
    expect(labels(defaultLegalLinks('corporate'))).toEqual(['Gizlilik Politikası'])
  })

  it('stores keep every document by default', () => {
    expect(defaultLegalLinks('ecommerce').length).toBeGreaterThan(1)
    expect(labels(resolveFooterLegal(undefined, store()))).toEqual(
      expect.arrayContaining(['Gizlilik Politikası', 'Teslimat ve İade', 'Mesafeli Satış Sözleşmesi']),
    )
  })

  it('seedFooterLegal persists privacy-only on a new corporate site and never overwrites', () => {
    const seeded = seedFooterLegal(corporate())
    const footer = seeded.sections.find((s) => s.type === 'footer') as {
      legal?: { links?: { label: string; href: string }[] }
    }
    expect(labels(footer.legal?.links ?? [])).toEqual(['Gizlilik Politikası'])
    expect(seedFooterLegal(seeded)).toBe(seeded)
    expect(labels(resolveFooterLegal(footer.legal, seeded))).toEqual(['Gizlilik Politikası'])
  })

  it('seedFooterLegal leaves stores untouched', () => {
    const site = store()
    expect(seedFooterLegal(site)).toBe(site)
  })

  it('existing corporate sites that never stored legal keep their published links', () => {
    expect(labels(resolveFooterLegal(undefined, corporate()))).toEqual([
      'Gizlilik Politikası',
      'Hizmet Sözleşmesi',
      'Üyelik Sözleşmesi',
    ])
    expect(labels(implicitLegalLinks('corporate'))).toHaveLength(3)
  })
})

describe('store footer required links', () => {
  const REQUIRED_LABELS = [
    'Gizlilik Politikası',
    'Hakkımızda',
    'İletişim',
    'Teslimat ve İade',
    'Mesafeli Satış Sözleşmesi',
  ]

  function fullStore(): WebsiteSchema {
    const site = store()
    site.sections.splice(site.sections.length - 1, 0, { type: 'contact' } as never)
    return site
  }

  /** The links the store footer really shows: columns excluded, essentials + official bar. */
  function barLabels(site: WebsiteSchema, legal?: { hidden?: boolean; links?: { label: string; href: string }[] }) {
    const columns = resolveFooterColumns(undefined, site)
    return [
      ...resolveStoreEssentialPageLinks(site, columns),
      ...resolveFooterLegal(legal, site),
    ].map((l) => l.label)
  }

  it('shows all five links by default', () => {
    expect(barLabels(fullStore())).toEqual(expect.arrayContaining(REQUIRED_LABELS))
  })

  it('keeps all five when the owner hides the bar or empties its links', () => {
    expect(barLabels(fullStore(), { hidden: true, links: [] })).toEqual(
      expect.arrayContaining(REQUIRED_LABELS),
    )
    expect(barLabels(fullStore(), { links: [] })).toEqual(expect.arrayContaining(REQUIRED_LABELS))
  })

  it('keeps the legal links when the owner removes them from a custom list', () => {
    const labels = barLabels(fullStore(), {
      links: [{ label: 'Üyelik Sözleşmesi', href: '/yasal/uyelik-sozlesmesi' }],
    })
    expect(labels).toEqual(expect.arrayContaining(REQUIRED_LABELS))
  })

  it('cannot hide the three required documents even when listed as hidden', () => {
    const site = fullStore()
    site.legalDocs = {
      hidden: ['gizlilik-politikasi', 'teslimat-ve-iade', 'mesafeli-satis-sozlesmesi'],
    } as never
    expect(barLabels(site)).toEqual(expect.arrayContaining(REQUIRED_LABELS))
  })

  it('links the delivery & returns document under its combined name', () => {
    const link = resolveFooterLegal(undefined, fullStore()).find((l) => l.href === '/yasal/teslimat-ve-iade')
    expect(link?.label).toBe('Teslimat ve İade')
  })

  it('does not link a hidden about/contact section (no dead links)', () => {
    const site = fullStore()
    for (const s of site.sections) if (s.type === 'about' || s.type === 'contact') s.hidden = true
    const labels = barLabels(site)
    expect(labels).not.toContain('Hakkımızda')
    expect(labels).not.toContain('İletişim')
  })

  it('does not add store essentials to corporate sites', () => {
    expect(resolveStoreEssentialPageLinks(corporate(), [])).toEqual([])
    expect(resolveFooterLegal(undefined, corporate()).map((l) => l.label)).not.toContain(
      'Mesafeli Satış Sözleşmesi',
    )
  })
})

describe('editor target options', () => {
  it('every offered option is a valid target', () => {
    for (const site of [corporate(), store()]) {
      const pages = [
        { slug: 'home', title: 'Ana Sayfa', isHome: true },
        { slug: 'hakkimizda', title: 'Hakkımızda', isHome: false },
      ]
      for (const group of footerTargetOptions(site, 'tr', pages)) {
        for (const option of group.options) {
          expect(validateFooterHref(option.value, site).ok, option.value).toBe(true)
        }
      }
    }
  })

  it('hides store targets on non-stores and classifies custom kinds', () => {
    const groups = footerTargetOptions(corporate(), 'tr').map((g) => g.group)
    expect(groups).not.toContain('Mağaza')
    expect(customKindOf('https://a.com')).toBe('external')
    expect(customKindOf('mailto:a@b.co')).toBe('mail')
    expect(customKindOf('tel:+90')).toBe('tel')
    expect(customKindOf('#about')).toBeNull()
  })
})
