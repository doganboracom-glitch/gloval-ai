import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { SectionDetailPage } from '@/components/website-renderer/sections/section-detail-page'
import { demos, buildDemoSite } from '@/lib/demos'
import { fallbackWebsite, websiteSchema, type WebsiteSchema } from '@/lib/website-schema'
import { resolveTheme, themeToCssVars } from '@/components/website-renderer/theme'
import { findPublicPage, isPageIndexable, pagePath } from '@/lib/website-pages'
import { applyOperation } from '@/lib/website-edit-operations'
import { stripSampleContent } from '@/lib/sample-content'
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumb-jsonld'
import {
  aboutDetailLink,
  buildStarterAboutDetail,
  detailDescription,
  findAboutSection,
  resolveAboutDetail,
  syncDetailPages,
} from '@/lib/section-detail'

const PLACEHOLDER = /lorem|ipsum|placeholder|yer tutucu|dolor sit|\bTODO\b|\bTBD\b|\{\{|\}\}/i

function demoSite(i: number, lang: 'tr' | 'en' = 'tr'): WebsiteSchema {
  return buildDemoSite(demos[i], lang)
}

function aboutIndex(site: WebsiteSchema): number {
  return site.sections.findIndex((s) => s.type === 'about')
}

/** A site in which the owner already approved the detail page text. */
function approvedSite(lang: 'tr' | 'en' = 'tr', topic = 'kahve dükkanı ve atölye'): WebsiteSchema {
  const base = fallbackWebsite(topic, lang)
  const i = aboutIndex(base)
  const withDetail = applyOperation(base, {
    op: 'updateSectionDetail',
    index: i,
    patch: {
      linkEnabled: true,
      pageEnabled: true,
      heading: lang === 'en' ? 'Our story' : 'Hikayemiz',
      blocks: [
        { heading: lang === 'en' ? 'Who we are' : 'Biz kimiz', level: 'h2', body: 'Ekibimiz her gün özenle çalışır.' },
        { heading: lang === 'en' ? 'How we work' : 'Nasıl çalışırız', level: 'h2', body: 'Her adımı birlikte planlarız.' },
      ],
      approve: true,
    },
  })
  return withDetail
}

function themedDetail(site: WebsiteSchema, mode: 'light' | 'dark') {
  const themed = { ...site, theme: { ...site.theme, mode } }
  const style = themeToCssVars(resolveTheme(themed))
  return renderToStaticMarkup(
    <div style={style} data-width="375">
      <SectionDetailPage site={themed} />
    </div>,
  )
}

describe('home page "Daha fazlası…" link', () => {
  it('is rendered, pointing at the real detail page, once the page is on', () => {
    for (const lang of ['tr', 'en'] as const) {
      const site = approvedSite(lang)
      const link = aboutDetailLink(site)
      expect(link).not.toBeNull()
      const html = renderToStaticMarkup(<WebsiteRenderer site={site} pageRouting initialPage={null} />)
      expect(html).toContain(`href="${link!.href}"`)
      expect(html).toContain(link!.label)
    }
  })

  it('is absent when the link switch is off', () => {
    const site = applyOperation(approvedSite(), {
      op: 'updateSectionDetail',
      index: aboutIndex(approvedSite()),
      patch: { linkEnabled: false },
    })
    expect(aboutDetailLink(site)).toBeNull()
    const html = renderToStaticMarkup(<WebsiteRenderer site={site} pageRouting initialPage={null} />)
    const label = aboutDetailLink(approvedSite())!.label
    expect(html).not.toContain(label)
  })
})

describe('detail page render', () => {
  for (const lang of ['tr', 'en'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${lang} / ${mode} / 375px: heading band, breadcrumb, body, CTA`, () => {
        const site = approvedSite(lang)
        const html = themedDetail(site, mode)
        expect(html).toContain('data-gv-detail-page')
        expect(html).toContain('data-gv-breadcrumb')
        expect(html).toContain(lang === 'en' ? 'Home' : 'Ana sayfa')
        expect(html).toContain('<h1')
        expect(html).toContain(lang === 'en' ? 'Who we are' : 'Biz kimiz')
        expect(html).toContain('data-gv-detail-cta')
        // Only theme variables colour the page, so it adapts to light and dark.
        expect(html).toContain('var(--site-')
        expect(html).not.toMatch(/#fff\b|#000\b|color:\s*white|color:\s*black/i)
        // Mobile safety: no fixed pixel widths that could overflow 375px.
        expect(html).not.toMatch(/width:\s*(\d{3,4})px/)
      })
    }
  }

  it('renders nothing when the site has no detail content', () => {
    expect(renderToStaticMarkup(<SectionDetailPage site={fallbackWebsite('kahve', 'tr')} />)).toBe('')
  })
})

describe('switch off => 404 for the public route', () => {
  it('findPublicPage returns nothing when pageEnabled is false', () => {
    const on = approvedSite()
    expect(findPublicPage(on, 'hakkimizda')).toBeTruthy()
    const off = applyOperation(on, {
      op: 'updateSectionDetail',
      index: aboutIndex(on),
      patch: { pageEnabled: false },
    })
    expect(findPublicPage(off, 'hakkimizda')).toBeFalsy()
    expect((off.pages ?? []).some((p) => p.kind === 'detail')).toBe(false)
  })
})

describe('approval gate: unapproved text never shows on the public site', () => {
  it('stripSampleContent switches the page and link off and the route 404s', () => {
    const site = demoSite(0)
    const detail = findAboutSection(site)!.detail!
    detail.sample = true
    expect(findPublicPage(site, 'hakkimizda')).toBeTruthy()
    const published = stripSampleContent(site)
    expect(findPublicPage(published, 'hakkimizda')).toBeFalsy()
    expect(aboutDetailLink(published)).toBeNull()
    const html = renderToStaticMarkup(<WebsiteRenderer site={published} pageRouting initialPage={null} />)
    expect(html).not.toContain('href="/hakkimizda"')
    // Block 0 repeats the home about text; the later blocks exist only on the detail page.
    const shared = new Set([site.meta.tagline, site.meta.description].filter(Boolean))
    const extra = (detail.blocks ?? []).slice(1).map((b) => b.body).filter((b) => !shared.has(b))
    expect(extra.length).toBeGreaterThan(0)
    for (const body of extra) expect(html).not.toContain(body)
  })

  it('approving the text makes the page public again', () => {
    const site = demoSite(0)
    const i = aboutIndex(site)
    findAboutSection(site)!.detail!.sample = true
    const approved = applyOperation(site, { op: 'updateSectionDetail', index: i, patch: { approve: true } })
    const published = stripSampleContent(approved)
    expect(findPublicPage(published, 'hakkimizda')).toBeTruthy()
  })
})

describe('page limit', () => {
  const full = (n: number): WebsiteSchema => {
    const base = fallbackWebsite('kahve dükkanı', 'tr')
    const pages = Array.from({ length: n }, (_, k) => ({
      slug: k === 0 ? 'home' : `sayfa-${k}`,
      title: `Sayfa ${k}`,
      ...(k === 0 ? { isHome: true } : {}),
    }))
    return { ...base, pages }
  }
  const detailSite = (site: WebsiteSchema) => ({
    ...site,
    sections: site.sections.map((s) => (s.type === 'about' ? { ...s, detail: buildStarterAboutDetail(site, s) } : s)),
  })

  for (const [plan, limit] of [['FREE', 5], ['STARTER', 8], ['PRO', 15], ['PRO+', 15]] as const) {
    it(`${plan}: creates the page below ${limit} pages, never when full`, () => {
      const below = syncDetailPages(detailSite(full(limit - 1)), limit)
      expect(below.pages!.length).toBe(limit)
      expect(below.pages!.some((p) => p.kind === 'detail')).toBe(true)

      const atLimit = syncDetailPages(detailSite(full(limit)), limit)
      expect(atLimit.pages!.length).toBe(limit)
      expect(atLimit.pages!.some((p) => p.kind === 'detail')).toBe(false)
    })
  }

  it('the detail page counts toward the limit', () => {
    const s = syncDetailPages(detailSite(full(4)), 5)
    expect(s.pages!.length).toBe(5)
    const second = syncDetailPages(s, 5)
    expect(second.pages!.length).toBe(5)
  })

  it('adopts an empty About page instead of adding a new one when full', () => {
    const base = detailSite(full(5))
    const pages = [...base.pages!]
    pages[2] = { slug: 'hakkimizda', title: 'Hakkımızda' }
    const out = syncDetailPages({ ...base, pages }, 5)
    expect(out.pages!.length).toBe(5)
    expect(out.pages![2].kind).toBe('detail')
  })
})

describe('no lorem or placeholder text', () => {
  it('starter detail for every sector is clean', () => {
    for (const topic of ['kahve dükkanı', 'diş kliniği', 'avukatlık ofisi', 'güzellik salonu', 'yazılım ajansı']) {
      for (const lang of ['tr', 'en'] as const) {
        const site = fallbackWebsite(topic, lang)
        const about = findAboutSection(site)
        if (!about) continue
        const detail = buildStarterAboutDetail(site, about)
        const text = JSON.stringify(detail)
        expect(text).not.toMatch(PLACEHOLDER)
        for (const b of detail.blocks ?? []) expect(b.body.trim().length).toBeGreaterThanOrEqual(25)
      }
    }
  })

  it('all 8 demo detail pages are clean and render', () => {
    for (let i = 0; i < demos.length; i++) {
      for (const lang of ['tr', 'en'] as const) {
        const site = demoSite(i, lang)
        const html = renderToStaticMarkup(<SectionDetailPage site={site} />)
        expect(html, demos[i].slug).toContain('data-gv-detail-page')
        expect(html).not.toMatch(PLACEHOLDER)
      }
    }
  })
})

describe('8 demos expose /demo/<slug>/hakkimizda', () => {
  it('each demo has an active detail page at the about slug', () => {
    expect(demos).toHaveLength(8)
    for (let i = 0; i < demos.length; i++) {
      const tr = demoSite(i, 'tr')
      expect(findPublicPage(tr, 'hakkimizda'), demos[i].slug).toBeTruthy()
      expect(aboutDetailLink(tr), demos[i].slug).not.toBeNull()
      const en = demoSite(i, 'en')
      const enPage = (en.pages ?? []).find((p) => p.kind === 'detail')
      expect(enPage, `${demos[i].slug} en`).toBeTruthy()
    }
  })
})

describe('SEO', () => {
  const site = approvedSite()
  const origin = 'https://acme.gloval.site'

  it('canonical path, indexable and sitemap-eligible', () => {
    const page = findPublicPage(site, 'hakkimizda')!
    expect(pagePath(site, page.slug)).toBe('/hakkimizda')
    expect(`${origin}${pagePath(site, page.slug)}`).toBe(`${origin}/hakkimizda`)
    expect(isPageIndexable(page)).toBe(true)
  })

  it('meta description is built from the real text', () => {
    const resolved = resolveAboutDetail(site)!
    const description = detailDescription(resolved)
    expect(description.length).toBeGreaterThan(20)
    expect(description.length).toBeLessThanOrEqual(200)
    expect(description).not.toMatch(PLACEHOLDER)
  })

  it('BreadcrumbList JSON-LD is valid and script-safe', () => {
    const json = buildBreadcrumbJsonLd({ origin: `${origin}/`, homeName: 'Acme', pageName: 'Hakkımızda </script>', pagePath: 'hakkimizda' })
    expect(json).not.toContain('</script>')
    const parsed = JSON.parse(json)
    expect(parsed['@type']).toBe('BreadcrumbList')
    expect(parsed.itemListElement[0].item).toBe(origin)
    expect(parsed.itemListElement[1].item).toBe(`${origin}/hakkimizda`)
    expect(parsed.itemListElement.map((x: { position: number }) => x.position)).toEqual([1, 2])
  })

  it('metadata + sitemap use the tenant origin and list the detail page', async () => {
    vi.resetModules()
    vi.doMock('@/lib/projects', () => ({
      getPublishedSite: async () => ({ name: 'Acme', schema: site }),
    }))
    vi.doMock('@/lib/seo/site-seo', () => ({
      getSiteSeoContext: async () => ({ origin, lastModified: '2026-01-01' }),
    }))
    const { buildSitePageMetadata } = await import('@/components/site/public-site-view')
    const meta = await buildSitePageMetadata('acme', 'hakkimizda')
    expect(meta.alternates?.canonical).toBe(`${origin}/hakkimizda`)
    expect(meta.title).toContain('Acme')
    expect(String(meta.description).length).toBeGreaterThan(20)
    expect(meta.robots).toMatchObject({ index: true })
    vi.doUnmock('@/lib/projects')
    vi.doUnmock('@/lib/seo/site-seo')
  })
})

describe('older schemas stay valid', () => {
  it('a site without detail or page kinds parses and round-trips', () => {
    const legacy = fallbackWebsite('kahve dükkanı', 'tr')
    const parsed = websiteSchema.safeParse(JSON.parse(JSON.stringify(legacy)))
    expect(parsed.success).toBe(true)
    expect(findAboutSection(legacy)?.detail).toBeUndefined()
    expect(aboutDetailLink(legacy)).toBeNull()
    expect(syncDetailPages(legacy)).toBe(legacy)
  })

  it('a site with the new fields parses', () => {
    expect(websiteSchema.safeParse(JSON.parse(JSON.stringify(demoSite(0)))).success).toBe(true)
  })
})
