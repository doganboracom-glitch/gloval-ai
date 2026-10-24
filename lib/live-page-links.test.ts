import { describe, expect, it } from 'vitest'
import ayYildiz from '@/lib/__fixtures__/published/ay-yildiz.json'
import dbajans from '@/lib/__fixtures__/published/dbajans.json'
import luna from '@/lib/__fixtures__/published/luna-mucevher.json'
import { canonicalRedirectTarget } from '@/lib/canonical-pages'
import { emptyPageSlugs, isEmptyPage, withLivePageLinks } from '@/lib/live-page-links'
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
    it(`${name}: same object, same header, footer and CTA`, () => {
      const site = asSite(json)
      expect(emptyPageSlugs(site)).toEqual([])
      const pruned = withLivePageLinks(site)
      expect(pruned).toBe(site)
      expect(renderedMenu(pruned)).toEqual(renderedMenu(site))
    })
  }
})

function withoutDeadPages(site: WebsiteSchema): WebsiteSchema {
  const dead = new Set(emptyPageSlugs(site))
  return { ...site, pages: site.pages.filter((p) => !dead.has(p.slug)) }
}
