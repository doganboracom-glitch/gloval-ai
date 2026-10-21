import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'
import { resolveAboutDetail } from '@/lib/section-detail'
import { mapDemoHref } from '@/components/website-renderer/site-nav-context'

function hrefsOf(html: string): string[] {
  return Array.from(html.matchAll(/<a\s[^>]*?href="([^"]*)"/g), (m) => m[1].replace(/&amp;/g, '&'))
}

function renderDemo(slug: string, lang: 'tr' | 'en', page: 'home' | 'about') {
  const demo = demos.find((d) => d.slug === slug)!
  const site = buildDemoSite(demo, lang)
  const aboutPageSlug = resolveAboutDetail(site)?.pageSlug ?? null
  const langQuery = lang === 'en' ? '?lang=en' : ''
  const html = renderToStaticMarkup(
    <WebsiteRenderer
      site={site}
      demoRoutes={{
        home: `/demo/${slug}${langQuery}`,
        about: `/demo/${slug}/hakkimizda${langQuery}`,
        aboutPageSlug,
      }}
      initialPage={page === 'about' ? aboutPageSlug : null}
    />,
  )
  return { html, hrefs: hrefsOf(html), aboutPageSlug }
}

/** Links that legitimately point at the platform (never at a demo-local page). */
const platformHref = /^(\/#showcase|\/yasal\/|https?:|mailto:|tel:|#)/

describe('demo raw HTML carries the demo’s own hrefs', () => {
  it('covers all 8 demos', () => {
    expect(demos).toHaveLength(8)
  })

  for (const demo of demos) {
    for (const lang of ['tr', 'en'] as const) {
      const q = lang === 'en' ? '?lang=en' : ''

      it(`${demo.slug} home (${lang}): "Daha fazlası…" points at /demo/${demo.slug}/hakkimizda`, () => {
        const { hrefs } = renderDemo(demo.slug, lang, 'home')
        expect(hrefs).toContain(`/demo/${demo.slug}/hakkimizda${q}`)
        expect(hrefs).not.toContain('/hakkimizda')
        expect(hrefs).not.toContain('/')
      })

      it(`${demo.slug} about page (${lang}): breadcrumb and CTA stay inside the demo`, () => {
        const { hrefs } = renderDemo(demo.slug, lang, 'about')
        expect(hrefs).toContain(`/demo/${demo.slug}${q}`)
        const leaks = hrefs.filter(
          (h) => h.startsWith('/') && !h.startsWith(`/demo/${demo.slug}`) && !platformHref.test(h),
        )
        expect(leaks).toEqual([])
        expect(hrefs).not.toContain('/')
        expect(hrefs).not.toContain('/hakkimizda')
        expect(hrefs).not.toContain('/#contact')
      })
    }
  }
})

describe('customer sites keep their /hakkimizda hrefs', () => {
  // The demo fixture's other links are demo-local by design; only the about/home rewrites matter.
  const isDemoAboutOrHome = (h: string) =>
    /^\/demo\/[^/?#]+(\?[^#]*)?(#.*)?$/.test(h) || /^\/demo\/[^/]+\/hakkimizda/.test(h)
  const site = buildDemoSite(demos[0], 'tr')
  const aboutPageSlug = resolveAboutDetail(site)?.pageSlug ?? null

  it('home links to /hakkimizda and never to /demo/…', () => {
    const html = renderToStaticMarkup(<WebsiteRenderer site={site} pageRouting initialPage={null} />)
    const hrefs = hrefsOf(html)
    expect(hrefs).toContain('/hakkimizda')
    expect(hrefs.filter(isDemoAboutOrHome)).toEqual([])
  })

  it('about page breadcrumb stays "/" and the CTA stays "/#contact" or the contact page', () => {
    const html = renderToStaticMarkup(<WebsiteRenderer site={site} pageRouting initialPage={aboutPageSlug} />)
    const hrefs = hrefsOf(html)
    expect(hrefs).toContain('/')
    expect(hrefs.filter(isDemoAboutOrHome)).toEqual([])
  })

  it('mapDemoHref is the identity without demo routes', () => {
    for (const href of ['/', '/hakkimizda', '/#contact', '/iletisim']) {
      expect(mapDemoHref(href, null)).toBe(href)
    }
  })
})

describe('mapDemoHref', () => {
  const routes = { home: '/demo/kahve?lang=en', about: '/demo/kahve/hakkimizda?lang=en', aboutPageSlug: 'hakkimizda' }

  it('maps home, anchors and the about page, and leaves everything else alone', () => {
    expect(mapDemoHref('/', routes)).toBe('/demo/kahve?lang=en')
    expect(mapDemoHref('/#contact', routes)).toBe('/demo/kahve?lang=en#contact')
    expect(mapDemoHref('/hakkimizda', routes)).toBe('/demo/kahve/hakkimizda?lang=en')
    expect(mapDemoHref('/urunler', routes)).toBe('/urunler')
    expect(mapDemoHref('https://gloval.ai', routes)).toBe('https://gloval.ai')
  })
})
