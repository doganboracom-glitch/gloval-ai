import { describe, expect, it } from 'vitest'
import ayYildiz from '@/lib/__fixtures__/published/ay-yildiz.json'
import dbajans from '@/lib/__fixtures__/published/dbajans.json'
import luna from '@/lib/__fixtures__/published/luna-mucevher.json'
import { canonicalRedirectTarget } from '@/lib/canonical-pages'
import { emptyPageSlugs, isDeadAnchor, isEmptyPage, liveSectionTypes, withLivePageLinks } from '@/lib/live-page-links'
import { ensureServicesSection } from '@/lib/services-section'
import { fallbackWebsite } from '@/lib/website-schema'
import { resolveFooterColumns, resolveFooterLegal } from '@/lib/footer-links'
import { pageMenuLabel, resolveFooterPages, resolveHeaderMenu } from '@/lib/site-menu'
import { findPublicPage, homeSlug, pageNavItems, pagePath } from '@/lib/website-pages'
import type { NavLink, Section, WebsiteSchema } from '@/lib/website-schema'

const asSite = (json: unknown) => json as unknown as WebsiteSchema

const footerOf = (site: WebsiteSchema) =>
  site.sections.find((s): s is Extract<Section, { type: 'footer' }> => s.type === 'footer')

/** Every internal link a visitor can click in the menu, header CTA and footer. */
function chromeLinks(site: WebsiteSchema): NavLink[] {
  const footer = footerOf(site)
  return [
    ...site.navigation.links,
    ...(site.navigation.cta ? [site.navigation.cta as NavLink] : []),
    ...(footer?.columns ?? []).flatMap((c) => c.links),
    ...(footer?.legal?.links ?? []),
  ]
}

/** A single-segment page address that the public site answers with a 404. */
function isDeadPageHref(site: WebsiteSchema, href: string): boolean {
  const match = /^\/([^/?#]+)\/?(?:[?#].*)?$/.exec(href.trim())
  if (!match) return false
  const token = match[1].toLowerCase()
  const isPage = (site.pages ?? []).some((p) => p.slug.toLowerCase() === token)
  if (isPage) return !findPublicPage(site, token) && token !== homeSlug(site)
  return /^(about|hakkimizda|hakkinda|services|hizmetler|hizmetlerimiz|faq|sss|contact|iletisim|gallery|galeri)$/.test(token)
    ? canonicalRedirectTarget(site, token) === null
    : false
}

function renderedMenu(site: WebsiteSchema) {
  const pages = pageNavItems(site)
  const header = resolveHeaderMenu({
    pages,
    links: site.navigation.links,
    blog: false,
    blogLabel: '',
    menuOrder: site.navigation.menuOrder,
  }).map((e) => ({ key: e.key, label: e.label, kind: e.kind, href: e.kind === 'link' ? e.link.href : e.kind === 'page' ? pagePath(site, e.page.slug) : '' }))
  const footerPages = resolveFooterPages(pages, site.navigation.menuOrder).map((p) => ({ label: pageMenuLabel(p), href: pagePath(site, p.slug) }))
  const footer = footerOf(site)
  return {
    header,
    cta: site.navigation.cta,
    footerPages,
    footerColumns: resolveFooterColumns(footer?.columns, site),
    footerLegal: resolveFooterLegal(footer?.legal, site, site.meta.language === 'en' ? 'en' : 'tr'),
  }
}

describe('ay-yildiz-tasimacilik (published data)', () => {
  const site = asSite(ayYildiz)
  const pruned = withLivePageLinks(site)

  it('has the dead pages the live 404s came from', () => {
    expect(emptyPageSlugs(site).sort()).toEqual(['about', 'faq'])
    expect(site.pages.some((p, i) => isEmptyPage(site, p, i) && p.slug === 'contact')).toBe(false)
  })

  it('shows 404 links before pruning (reproduces the report)', () => {
    const dead = chromeLinks(site).filter((l) => isDeadPageHref(withoutDeadPages(site), l.href))
    expect(dead.map((l) => l.href)).toEqual(expect.arrayContaining(['/about', '/faq']))
  })

  it('leaves no menu, header or footer link pointing at a 404', () => {
    const rendered = renderedMenu(pruned)
    const hrefs = [
      ...rendered.header.map((e) => e.href),
      ...(rendered.cta ? [rendered.cta.href] : []),
      ...rendered.footerPages.map((p) => p.href),
      ...rendered.footerColumns.flatMap((c) => c.links.map((l) => l.href)),
      ...rendered.footerLegal.map((l) => l.href),
    ]
    expect(hrefs.filter((h) => isDeadPageHref(pruned, h))).toEqual([])
    expect(hrefs.some((h) => h === '/about' || h === '/faq')).toBe(false)
  })

  it('sends a dead link to the home section when the home page has it, otherwise hides it', () => {
    const labels = Object.fromEntries(pruned.navigation.links.map((l) => [l.label, l.href]))
    expect(labels['S.S.S.']).toBe('#faq')
    expect(labels['Hakkımızda']).toBeUndefined()
    expect(labels['İletişim']).toBe('/contact')
  })

  it('keeps live links unchanged', () => {
    expect(pruned.navigation.links.find((l) => l.label === 'Galeri')).toEqual({ href: '#gallery', label: 'Galeri' })
    expect(pruned.navigation.cta).toEqual(site.navigation.cta)
    expect(pruned.pages.map((p) => p.slug)).toEqual(['home', 'contact', 'galeri'])
  })

  it('does not mutate the source schema', () => {
    expect(site.pages.map((p) => p.slug)).toEqual(['home', 'about', 'faq', 'contact', 'galeri'])
    expect(site.navigation.links).toHaveLength(5)
  })
})

describe('sites with no dead page keep their menu exactly', () => {
  for (const [name, json] of [
    ['dbajans.com.tr', dbajans],
    ['luna-mucevher.gloval.site', luna],
  ] as const) {
    it(`${name}: same header, footer and CTA`, () => {
      const site = asSite(json)
      expect(emptyPageSlugs(site)).toEqual([])
      const pruned = withLivePageLinks(site)
      expect(renderedMenu(pruned)).toEqual(renderedMenu(site))
      expect(pruned.pages).toBe(site.pages)
      if (json === dbajans) expect(pruned.navigation).toBe(site.navigation)
    })
  }

  it('luna: the only navigation difference is the unrendered #deals schema link (the header is built from pages)', () => {
    const site = asSite(luna)
    const pruned = withLivePageLinks(site)
    expect(site.navigation.links.filter((l) => !pruned.navigation.links.includes(l)).map((l) => l.href)).toEqual(['#deals'])
    expect(pruned.navigation.cta).toBe(site.navigation.cta)
    expect(pruned.navigation.menuOrder).toEqual(site.navigation.menuOrder)
  })

  it('dbajans.com.tr: the whole schema is returned untouched', () => {
    const site = asSite(dbajans)
    expect(withLivePageLinks(site)).toBe(site)
  })
})

type Json = unknown

/** Every `href` string in a piece of schema, with where it was found. */
function collectHrefs(node: Json, path = '$'): { path: string; href: string }[] {
  if (Array.isArray(node)) return node.flatMap((v, i) => collectHrefs(v, `${path}[${i}]`))
  if (!node || typeof node !== 'object') return []
  return Object.entries(node as Record<string, Json>).flatMap(([k, v]) =>
    k === 'href' && typeof v === 'string' ? [{ path: `${path}.href`, href: v }] : collectHrefs(v, `${path}.${k}`),
  )
}

/** Every internal link of the page: menu, header CTA, hero, CTA, cards, footer, and each page's own sections. */
function allLinks(site: WebsiteSchema) {
  return [
    ...collectHrefs(site.navigation, 'navigation'),
    ...collectHrefs(site.sections, 'sections'),
    ...collectHrefs(
      (site.pages ?? []).map((p) => (p as { sections?: Section[] }).sections ?? []),
      'pages',
    ),
  ]
}

describe('no internal link anywhere points at a page without content', () => {
  for (const [name, json] of [
    ['ay-yildiz-tasimacilik', ayYildiz],
    ['dbajans.com.tr', dbajans],
    ['luna-mucevher.gloval.site', luna],
  ] as const) {
    it(`${name}: menu, hero, CTA, footer and sections have no dead link`, () => {
      const pruned = withLivePageLinks(asSite(json))
      const dead = allLinks(pruned).filter((l) => isDeadPageHref(pruned, l.href))
      expect(dead).toEqual([])
    })
  }

  it('the scan really catches a dead link on an unpruned site', () => {
    const site = asSite(luna)
    expect(allLinks(site).filter((l) => isDeadPageHref(site, l.href)).map((l) => l.href)).toEqual(['/contact'])
  })
})

describe('hero and CTA buttons follow the menu rule', () => {
  const heroOf = (site: WebsiteSchema) =>
    site.sections.find((s): s is Extract<Section, { type: 'hero' }> => s.type === 'hero')!

  it('luna: "Hızlı Hediye Paketi" -> /contact becomes #contact (home has a contact section); nothing else changes', () => {
    const site = asSite(luna)
    const pruned = withLivePageLinks(site)
    const before = heroOf(site).slides![2]
    const after = heroOf(pruned).slides![2]
    expect(before.secondaryButton).toEqual({ ...before.secondaryButton!, href: '/contact' })
    expect(after.secondaryButton).toEqual({ ...before.secondaryButton!, href: '#contact' })

    // Undo every approved change; the rest of luna must be identical.
    const restore = JSON.parse(JSON.stringify(pruned))
    const original = JSON.parse(JSON.stringify(site))
    const ctaIndex = original.sections.findIndex((s: Section) => s.type === 'cta')
    restore.sections[0].slides[2].secondaryButton.href = '/contact'
    restore.sections[0].slides[1].secondaryButton.href = '#featured'
    restore.sections[0].secondaryButton.href = '#featured'
    restore.sections[0].primaryButton = original.sections[0].primaryButton
    restore.sections[ctaIndex].secondaryButton = original.sections[ctaIndex].secondaryButton
    restore.navigation.links = original.navigation.links
    expect(restore).toEqual(original)
  })

  it('ay-yildiz: hero "Hakkımızda" -> /about is hidden (no about section on home)', () => {
    const site = asSite(ayYildiz)
    const before = heroOf(site).slides![2]
    expect(before.secondaryButton?.href).toBe('/about')
    const after = heroOf(withLivePageLinks(site)).slides![2]
    expect('secondaryButton' in after).toBe(false)
    expect(after.primaryButton).toEqual(before.primaryButton)
  })

  it('a CTA section button to an empty page is anchored or removed the same way', () => {
    const site = asSite(ayYildiz)
    const withCta = {
      ...site,
      sections: site.sections.map((s) =>
        s.type === 'cta'
          ? { ...s, primaryButton: { label: 'SSS', href: '/faq' }, secondaryButton: { label: 'Biz', href: '/about' } }
          : s,
      ),
    } as WebsiteSchema
    const cta = withLivePageLinks(withCta).sections.find((s) => s.type === 'cta') as {
      primaryButton: { href: string }
      secondaryButton?: unknown
    }
    expect(cta.primaryButton.href).toBe('#faq')
    expect(cta.secondaryButton).toBeUndefined()
  })
})

function withoutDeadPages(site: WebsiteSchema): WebsiteSchema {
  const dead = new Set(emptyPageSlugs(site))
  return { ...site, pages: site.pages.filter((p) => !dead.has(p.slug)) }
}

const anchorsOf = (site: WebsiteSchema) =>
  allLinks(site).filter((l) => l.href.trim().startsWith('#') && l.href.trim().length > 1)

const deadAnchors = (site: WebsiteSchema) => {
  const live = liveSectionTypes(site)
  return anchorsOf(site).filter((l) => isDeadAnchor(l.href, live))
}

describe('every #anchor on the page has a target section', () => {
  it('ay-yildiz: reproduces the report (two #services buttons, no visible services section)', () => {
    const site = asSite(ayYildiz)
    expect(deadAnchors(site).map((l) => l.href)).toEqual(['#services', '#services'])
    expect(site.sections.some((s) => s.type === 'services' && s.hidden === true)).toBe(true)
  })

  it('ay-yildiz: after the rule no #anchor is left without a target and the buttons are hidden', () => {
    const pruned = withLivePageLinks(asSite(ayYildiz))
    expect(deadAnchors(pruned)).toEqual([])
    expect(anchorsOf(pruned).some((l) => l.href === '#services')).toBe(false)
  })

  for (const [name, json] of [
    ['ay-yildiz-tasimacilik', ayYildiz],
    ['dbajans.com.tr', dbajans],
    ['luna-mucevher.gloval.site', luna],
  ] as const) {
    it(`${name}: all #anchors resolve to a rendered section`, () => {
      expect(deadAnchors(withLivePageLinks(asSite(json)))).toEqual([])
    })
  }

  it('dbajans keeps every anchor and its schema is returned untouched', () => {
    const dba = asSite(dbajans)
    expect(deadAnchors(dba)).toEqual([])
    expect(withLivePageLinks(dba)).toBe(dba)
  })

  it('luna: reproduces the report (#featured and #deals have no element with that id)', () => {
    const site = asSite(luna)
    const dead = deadAnchors(site)
    expect([...new Set(dead.map((l) => l.href))].sort()).toEqual(['#deals', '#featured'])
    const byPath = Object.fromEntries(dead.map((l) => [l.path, l.href]))
    expect(byPath['sections[0].slides[1].secondaryButton.href']).toBe('#featured')
    const ctaIndex = site.sections.findIndex((s) => s.type === 'cta')
    expect(byPath[`sections[${ctaIndex}].secondaryButton.href`]).toBe('#deals')
    const types = new Set(site.sections.map((s) => s.type))
    expect(types.has('products')).toBe(true)
    expect(site.sections.filter((s) => s.type === 'products')).toHaveLength(2)
  })

  it('luna: #featured goes to the real product list id, #deals is hidden (several product sections share that id)', () => {
    const site = asSite(luna)
    const pruned = withLivePageLinks(site)
    expect(deadAnchors(pruned)).toEqual([])

    const heroOf = (s: WebsiteSchema) => s.sections.find((x) => x.type === 'hero') as Extract<Section, { type: 'hero' }>
    const before = heroOf(site)
    const after = heroOf(pruned)
    expect(before.slides![1].secondaryButton).toEqual({ href: '#featured', label: 'Sepete Ekle' })
    expect(after.slides![1].secondaryButton).toEqual({ href: '#products', label: 'Sepete Ekle' })
    expect(after.secondaryButton).toEqual({ href: '#products', label: 'Öne Çıkan Ürünler' })
    expect(after.primaryButton).toBeUndefined()

    const cta = pruned.sections.find((s) => s.type === 'cta') as Extract<Section, { type: 'cta' }>
    expect(cta.secondaryButton).toBeUndefined()
    expect(cta.primaryButton?.href).toBe('#contact')
  })

  it('luna: every #anchor that is left points at an id the page renders', () => {
    const pruned = withLivePageLinks(asSite(luna))
    const rendered = new Set(pruned.sections.filter((s) => !s.hidden).map((s) => s.type))
    const onPage = anchorsOf(pruned).filter((l) => l.path.startsWith('sections'))
    for (const link of onPage) {
      expect(rendered.has(link.href.slice(1) as Section['type']), `${link.path} -> ${link.href}`).toBe(true)
    }
    expect([...new Set(onPage.map((l) => l.href))].sort()).toEqual([
      '#categories',
      '#contact',
      '#faq',
      '#products',
    ])
  })

  it('a #featured link is hidden when the site has no product section at all', () => {
    const site = asSite(ayYildiz)
    const withFeatured = {
      ...site,
      sections: site.sections.map((s) =>
        s.type === 'cta' ? { ...s, primaryButton: { label: 'Öne Çıkanlar', href: '#featured' } } : s,
      ),
    } as WebsiteSchema
    const cta = withLivePageLinks(withFeatured).sections.find((s) => s.type === 'cta') as { primaryButton?: unknown }
    expect(cta.primaryButton).toBeUndefined()
  })

  it('menu, CTA, card and footer anchors to a missing section are hidden too', () => {
    const site = asSite(luna)
    const withDead = {
      ...site,
      navigation: {
        ...site.navigation,
        links: [...site.navigation.links, { label: 'Hizmetler', href: '#services' }],
        cta: { label: 'Hizmetler', href: '#services' },
      },
      sections: site.sections.map((s) =>
        s.type === 'footer'
          ? { ...s, columns: [{ title: 'Menü', links: [{ label: 'Hizmetler', href: '#services' }, { label: 'İletişim', href: '#contact' }] }] }
          : s,
      ),
    } as WebsiteSchema
    expect(deadAnchors(withDead).length).toBeGreaterThanOrEqual(3)
    const pruned = withLivePageLinks(withDead)
    expect(deadAnchors(pruned)).toEqual([])
    expect(pruned.navigation.cta).toBeUndefined()
    expect(footerOf(pruned)?.columns?.[0].links).toEqual([{ label: 'İletişim', href: '#contact' }])
  })
})

describe('generation always leaves a #services target when services are linked', () => {
  const withoutServices = (site: WebsiteSchema): WebsiteSchema => ({
    ...site,
    sections: site.sections.filter((s) => s.type !== 'services'),
  })

  it('ay-yildiz without its services section: the generated features list becomes the services list (nothing invented)', () => {
    const generated = withoutServices(asSite(ayYildiz))
    expect(deadAnchors(generated).map((l) => l.href)).toEqual(['#services', '#services'])
    const features = generated.sections.find((s) => s.type === 'features') as Extract<Section, { type: 'features' }>
    const ensured = ensureServicesSection(generated)
    const services = ensured.sections.find((s) => s.type === 'services') as Extract<Section, { type: 'services' }>
    expect(services).toBeDefined()
    expect(services.hidden).toBeUndefined()
    expect(services.items.map((i) => [i.title, i.description])).toEqual(
      features.items.slice(0, 8).map((i) => [i.title, i.description]),
    )
    expect(deadAnchors(ensured)).toEqual([])
    expect(anchorsOf(withLivePageLinks(ensured)).filter((l) => l.href === '#services').length).toBeGreaterThanOrEqual(2)
  })

  it('a hidden services section is shown again at generation time', () => {
    const ensured = ensureServicesSection(asSite(ayYildiz))
    expect(ensured.sections.find((s) => s.type === 'services')?.hidden).toBeUndefined()
    expect(deadAnchors(ensured)).toEqual([])
  })

  it('a site that never links to services gets nothing added; storefronts are skipped', () => {
    const quiet = withoutServices(asSite(dbajans))
    expect(ensureServicesSection(quiet)).toBe(quiet)
  })

  it('deterministic fallback site: no dead #anchor after ensure + publish rule', () => {
    for (const prompt of ['nakliyat ve taşımacılık firması', 'diş kliniği', 'hukuk bürosu']) {
      const site = withLivePageLinks(ensureServicesSection(fallbackWebsite(prompt, 'tr')))
      expect(deadAnchors(site)).toEqual([])
    }
  })
})
