import { describe, expect, it } from 'vitest'
import { PAGE_LIMITS } from '@/lib/pricing-config'
import { canonicalRedirectTarget, finalizeGeneratedPages } from '@/lib/canonical-pages'
import { findPublicPage, sectionsForPage } from '@/lib/website-pages'
import { fallbackWebsite, type Section, type WebsiteSchema } from '@/lib/website-schema'

const sec = (type: string, extra: Record<string, unknown> = {}) => ({ type, title: type, items: [], ...extra }) as unknown as Section

function modelSite(pages: Array<{ slug: string; title: string; isHome?: boolean }>, sectionTypes: string[]): WebsiteSchema {
  const base = fallbackWebsite('nakliyat firmasi', 'tr')
  return {
    ...base,
    sections: sectionTypes.map((t) => sec(t)),
    pages,
    navigation: { ...base.navigation, links: [{ label: 'SSS', href: '/faq' }, { label: 'Hizmetler', href: '/services' }, { label: 'Hakkimizda', href: '/about' }] },
  } as WebsiteSchema
}

const SIX_PAGES = [
  { slug: 'home', title: 'Ana Sayfa', isHome: true },
  { slug: 'about', title: 'Hakkımızda' },
  { slug: 'services', title: 'Hizmetler' },
  { slug: 'faq', title: 'SSS' },
  { slug: 'gallery', title: 'Galeri' },
  { slug: 'contact', title: 'İletişim' },
]
const TYPES = ['hero', 'about', 'services', 'process', 'gallery', 'faq', 'contact', 'footer']

describe('finalizeGeneratedPages', () => {
  const free = PAGE_LIMITS.free
  const out = finalizeGeneratedPages(modelSite(SIX_PAGES, TYPES), 'tr', free)
  const slugs = (out.pages ?? []).map((p) => p.slug)

  it('never exceeds the plan page limit and keeps Services on the home page', () => {
    expect(out.pages?.length).toBeLessThanOrEqual(free)
    expect(slugs).not.toContain('hizmetlerimiz')
    expect(out.sections.some((s) => s.type === 'services')).toBe(true)
  })

  it('uses real Turkish addresses without collisions', () => {
    expect(slugs).toEqual(expect.arrayContaining(['hakkimizda', 'sss', 'iletisim']))
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('each page shows only its own sections', () => {
    const types = (slug: string) => sectionsForPage(out, slug).map((s) => s.type).filter((t) => t !== 'footer')
    expect(types('hakkimizda')).toEqual(['about'])
    expect(types('sss')).toEqual(['faq'])
    expect(types('iletisim')).toEqual(['contact'])
  })

  it('rewrites internal links to the new addresses or home anchors', () => {
    const hrefs = out.navigation.links.map((l) => l.href)
    expect(hrefs).toEqual(['/sss', '#services', '/hakkimizda'])
  })

  it('keeps Services as its own page when the plan has room', () => {
    const pro = finalizeGeneratedPages(modelSite(SIX_PAGES, TYPES), 'tr', 8)
    expect(pro.pages?.map((p) => p.slug)).toContain('hizmetlerimiz')
    expect(pro.pages?.length).toBe(6)
  })

  it('drops a page that has no content of its own and de-duplicates a kind', () => {
    const pages = [...SIX_PAGES, { slug: 'sik-sorulan-sorular', title: 'Sıkça Sorulan Sorular' }]
    const noFaq = finalizeGeneratedPages(modelSite(pages, TYPES.filter((t) => t !== 'faq')), 'tr', 8)
    expect((noFaq.pages ?? []).some((p) => p.slug === 'sss')).toBe(false)
    const twice = finalizeGeneratedPages(modelSite(pages, TYPES), 'tr', 8)
    expect((twice.pages ?? []).filter((p) => p.slug === 'sss').length).toBe(1)
  })

  it('uses English addresses for English sites', () => {
    const en = finalizeGeneratedPages(modelSite(SIX_PAGES, TYPES), 'en', 8)
    expect(en.pages?.map((p) => p.slug)).toEqual(expect.arrayContaining(['about', 'faq', 'contact', 'services']))
  })

  it('is a no-op for a site that already complies', () => {
    expect(finalizeGeneratedPages(out, 'tr', free)).toEqual(out)
  })
})

describe('canonicalRedirectTarget', () => {
  const site = finalizeGeneratedPages(modelSite(SIX_PAGES, TYPES), 'tr', PAGE_LIMITS.free)

  it('sends the old English addresses to the new Turkish ones', () => {
    expect(canonicalRedirectTarget(site, 'about')).toBe('/hakkimizda')
    expect(canonicalRedirectTarget(site, 'faq')).toBe('/sss')
    expect(canonicalRedirectTarget(site, 'contact')).toBe('/iletisim')
  })

  it('has nothing to redirect for a page that does not exist or an unknown address', () => {
    expect(canonicalRedirectTarget(site, 'services')).toBeNull()
    expect(canonicalRedirectTarget(site, 'whatever')).toBeNull()
    expect(findPublicPage(site, 'about')).toBeNull()
  })

  it('leaves an existing site on its current addresses untouched', () => {
    const legacy = modelSite(SIX_PAGES, TYPES)
    expect(canonicalRedirectTarget(legacy, 'about')).toBeNull()
    expect(canonicalRedirectTarget(legacy, 'faq')).toBeNull()
    expect(canonicalRedirectTarget(legacy, 'contact')).toBeNull()
  })
})
