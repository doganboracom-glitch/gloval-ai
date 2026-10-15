import { describe, expect, it } from 'vitest'
import { buildSampleSections } from '@/lib/__fixtures__/sample-site'
import { PAGE_LIMITS, NAV_LINK_MAX, SITE_PAGE_HARD_CAP } from '@/lib/pricing-config'
import { isPageGrowthBlocked, pageLimitForPlan } from '@/lib/page-limits'
import { stripSampleContent } from '@/lib/sample-content'
import { applyOperation } from '@/lib/website-edit-operations'
import {
  findPublicPage,
  isPageIndexable,
  materializePages,
  pagePath,
  sectionsForPage,
  withPageRedirects,
} from '@/lib/website-pages'
import { fallbackWebsite, websiteSchema, type WebsiteSchema } from '@/lib/website-schema'

type PageInput = NonNullable<WebsiteSchema['pages']>[number]

function legacySite(pages: Array<Pick<PageInput, 'slug' | 'title'> & { isHome?: boolean }>): WebsiteSchema {
  return { ...fallbackWebsite('kahve dükkanı', 'tr'), pages: pages as WebsiteSchema['pages'] }
}

const LEGACY_PAGES = [
  { slug: 'home', title: 'Ana Sayfa', isHome: true },
  { slug: 'hakkimizda', title: 'Hakkımızda' },
  { slug: 'iletisim', title: 'İletişim' },
]

describe('migration of pre-F1a schemas', () => {
  it('reads an old schema (no kind/sections/seo/indexable) and materializes pages on save', () => {
    const old = legacySite(LEGACY_PAGES)
    expect(websiteSchema.safeParse(old).success).toBe(true)

    const migrated = materializePages(old)
    const pages = migrated.pages ?? []
    expect(pages[0].kind).toBe('home')
    expect(pages[0].sections).toBeUndefined()
    for (const page of pages.slice(1)) {
      expect(page.kind).toBe('custom')
      expect((page.sections ?? []).length).toBeGreaterThan(0)
    }
    expect(websiteSchema.safeParse(migrated).success).toBe(true)
    expect(migrated.sections).toEqual(old.sections)
  })

  it('is idempotent and loses no data', () => {
    const once = materializePages(legacySite(LEGACY_PAGES))
    expect(materializePages(once)).toBe(once)
  })

  it('keeps the home page at / and the home slug unresolvable', () => {
    const site = materializePages(legacySite(LEGACY_PAGES))
    expect(pagePath(site, 'home')).toBe('/')
    expect(pagePath(site, 'hakkimizda')).toBe('/hakkimizda')
    expect(findPublicPage(site, 'home')).toBeNull()
  })

  it('renders an old site the same before and after materialization', () => {
    const old = legacySite(LEGACY_PAGES)
    const migrated = materializePages(old)
    for (const { slug } of LEGACY_PAGES) {
      const before = sectionsForPage(old, slug).map((s) => s.type)
      const after = sectionsForPage(migrated, slug).map((s) => s.type)
      expect(after).toEqual(before)
    }
  })

  it('leaves single-page and page-less sites untouched', () => {
    const noPages = { ...fallbackWebsite('kahve dükkanı', 'tr'), pages: undefined } as unknown as WebsiteSchema
    expect(materializePages(noPages)).toBe(noPages)
    expect(sectionsForPage(noPages, 'home')).toEqual(noPages.sections.filter((s) => !s.hidden))
  })
})

describe('plan page limits', () => {
  it('has one source: Free 5 / Starter 8 / PRO 15 / E-Ticaret 15, hard cap 15, menu 10', () => {
    expect(PAGE_LIMITS).toEqual({ free: 5, starter: 8, pro: 15, ecommerce: 15 })
    expect(SITE_PAGE_HARD_CAP).toBe(15)
    expect(NAV_LINK_MAX).toBe(10)
    for (const plan of ['free', 'starter', 'pro', 'ecommerce'] as const) {
      expect(pageLimitForPlan(plan)).toBe(PAGE_LIMITS[plan])
    }
  })

  it('caps the schema at 15 pages and 10 menu links', () => {
    const page = (i: number) => ({ slug: `sayfa-${i}`, title: `Sayfa ${i}`, isHome: i === 0 })
    const base = fallbackWebsite('kahve dükkanı', 'tr')
    const fifteen = { ...base, pages: Array.from({ length: 15 }, (_, i) => page(i)) }
    const sixteen = { ...base, pages: Array.from({ length: 16 }, (_, i) => page(i)) }
    expect(websiteSchema.safeParse(fifteen).success).toBe(true)
    expect(websiteSchema.safeParse(sixteen).success).toBe(false)

    const link = (i: number) => ({ label: `L${i}`, href: `#l${i}` })
    const tenLinks = { ...base, navigation: { ...base.navigation, links: Array.from({ length: 10 }, (_, i) => link(i)) } }
    const elevenLinks = { ...base, navigation: { ...base.navigation, links: Array.from({ length: 11 }, (_, i) => link(i)) } }
    expect(websiteSchema.safeParse(tenLinks).success).toBe(true)
    expect(websiteSchema.safeParse(elevenLinks).success).toBe(false)
  })

  it.each([
    ['free', 5],
    ['starter', 8],
    ['pro', 15],
    ['ecommerce', 15],
  ] as const)('%s: growth is blocked at the limit, never below it', (plan, limit) => {
    const max = pageLimitForPlan(plan)
    expect(max).toBe(limit)
    expect(isPageGrowthBlocked(max - 1, max, max)).toBe(false)
    expect(isPageGrowthBlocked(max, max + 1, max)).toBe(true)
  })

  it('a downgraded site keeps its pages: only growth is blocked', () => {
    const limit = pageLimitForPlan('free')
    expect(isPageGrowthBlocked(12, 12, limit)).toBe(false)
    expect(isPageGrowthBlocked(12, 10, limit)).toBe(false)
    expect(isPageGrowthBlocked(12, 13, limit)).toBe(true)
  })
})

describe('AI page operations', () => {
  const base = () => materializePages(legacySite(LEGACY_PAGES))

  it('addPage uses folded unique slugs and stops at the hard cap', () => {
    let site = applyOperation(base(), { op: 'addPage', title: 'Hakkımızda' })
    expect(site.pages?.map((p) => p.slug)).toContain('hakkimizda-2')
    site = applyOperation(site, { op: 'addPage', title: 'Store' })
    expect(site.pages?.map((p) => p.slug)).toContain('store-2')

    let full = base()
    for (let i = 0; i < 30; i++) full = applyOperation(full, { op: 'addPage', title: `Sayfa ${i}` })
    expect(full.pages?.length).toBe(SITE_PAGE_HARD_CAP)
  })

  it('renamePage changes the slug but never the home slug', () => {
    const renamed = applyOperation(base(), { op: 'renamePage', pageIndex: 1, title: 'Biz Kimiz', slug: 'biz-kimiz' })
    expect(renamed.pages?.[1].slug).toBe('biz-kimiz')
    const home = applyOperation(base(), { op: 'renamePage', pageIndex: 0, title: 'Başlangıç', slug: 'baslangic' })
    expect(home.pages?.[0].slug).toBe('home')
  })

  it('setPageSeo writes per-page SEO and the indexable flag', () => {
    const site = applyOperation(base(), {
      op: 'setPageSeo',
      pageIndex: 1,
      title: 'Hakkımızda | Kahve',
      description: 'Hikayemiz',
      indexable: false,
    })
    expect(site.pages?.[1].seo).toEqual({ title: 'Hakkımızda | Kahve', description: 'Hikayemiz' })
    expect(isPageIndexable(site.pages![1])).toBe(false)
  })

  it('removePage never removes the home page', () => {
    expect(applyOperation(base(), { op: 'removePage', pageIndex: 0 }).pages?.length).toBe(3)
    expect(applyOperation(base(), { op: 'removePage', pageIndex: 1 }).pages?.length).toBe(2)
  })
})

describe('301 after a slug change', () => {
  it('records the old path and retargets older redirects to the newest slug', () => {
    const before = materializePages(legacySite(LEGACY_PAGES))
    const first = withPageRedirects(
      applyOperation(before, { op: 'renamePage', pageIndex: 1, title: 'Biz Kimiz', slug: 'biz-kimiz' }),
      before.pages,
    )
    expect(first.pageRedirects).toEqual([{ from: '/hakkimizda', to: '/biz-kimiz' }])

    const second = withPageRedirects(
      applyOperation(first, { op: 'renamePage', pageIndex: 1, title: 'Hikayemiz', slug: 'hikayemiz' }),
      first.pages,
    )
    expect(second.pageRedirects).toEqual(
      expect.arrayContaining([
        { from: '/biz-kimiz', to: '/hikayemiz' },
        { from: '/hakkimizda', to: '/hikayemiz' },
      ]),
    )
    expect(second.pageRedirects?.some((r) => r.from === r.to)).toBe(false)
  })

  it('resolves a multi-rename history in one hop from the first slug to the latest slug', () => {
    const original = materializePages(legacySite(LEGACY_PAGES))
    const renamedOnce = withPageRedirects(
      applyOperation(original, { op: 'renamePage', pageIndex: 1, title: 'Biz Kimiz', slug: 'biz-kimiz' }),
      original.pages,
    )
    const renamedTwice = withPageRedirects(
      applyOperation(renamedOnce, { op: 'renamePage', pageIndex: 1, title: 'Hikayemiz', slug: 'hikayemiz' }),
      renamedOnce.pages,
    )

    expect(renamedTwice.pageRedirects).toEqual(
      expect.arrayContaining([
        { from: '/hakkimizda', to: '/hikayemiz' },
        { from: '/biz-kimiz', to: '/hikayemiz' },
      ]),
    )
    expect(renamedTwice.pageRedirects).not.toContain({ from: '/hakkimizda', to: '/biz-kimiz' })
  })

  it('drops a redirect when its former slug is assigned to another live page', () => {
    const site = materializePages(legacySite([
      { slug: 'home', title: 'Ana Sayfa', isHome: true },
      { slug: 'a', title: 'A' },
      { slug: 'b', title: 'B' },
    ]))
    const withHistory = withPageRedirects(
      { ...site, pageRedirects: [{ from: '/a', to: '/b' }] },
      site.pages,
    )
    const reused = withPageRedirects(
      { ...withHistory, pages: [
        site.pages![0],
        { ...site.pages![1], slug: 'c' },
        { ...site.pages![2], slug: 'a' },
      ] },
      withHistory.pages,
    )

    expect(reused.pageRedirects).toEqual([{ from: '/b', to: '/a' }])
    expect(reused.pageRedirects).not.toContain({ from: '/a', to: '/c' })
    expect(reused.pageRedirects?.some((redirect) => redirect.from === '/a')).toBe(false)
  })

  it('returns the same object when nothing changed', () => {
    const site = materializePages(legacySite(LEGACY_PAGES))
    expect(withPageRedirects(site, site.pages)).toBe(site)
  })
})

describe('sample content on pages', () => {
  it('strips unapproved sample items from page sections too', () => {
    const sampleSection = buildSampleSections().find((s) => s.type === 'testimonials')!
    const site: WebsiteSchema = {
      ...legacySite(LEGACY_PAGES),
      pages: [
        { slug: 'home', title: 'Ana Sayfa', isHome: true },
        { slug: 'yorumlar', title: 'Yorumlar', kind: 'custom', sections: [sampleSection] },
      ] as WebsiteSchema['pages'],
    }
    const stripped = stripSampleContent(site)
    const serialized = JSON.stringify(stripped.pages)
    expect(serialized).not.toContain('"sample":true')
    expect(JSON.stringify(site.pages)).toContain('"sample":true')
    // The fixture's one confirmed item survives; only flagged items are dropped.
    expect(serialized).toContain('Gerçek bir yorum')
  })

  it('returns the same site when nothing is flagged', () => {
    const clean = materializePages(legacySite(LEGACY_PAGES))
    expect(stripSampleContent(clean)).toBe(clean)
  })
})
